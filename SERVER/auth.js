import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import  {createTokens,validateToken} from './jwt.js';
const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000',methods:["POST","GET"],credentials: true })); // Allow requests from localhost:3000
app.use(cookieParser());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "farhanf0220",
    database: "hospital"
});

   db.connect((err) => {
    if (err) {
        console.error("Error connecting to MySQL:", err);
        return;
    }
    console.log("Connected to MySQL database");
});



// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password, age, bloodgroup, phoneNumber, gender, aadharNo, address } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        db.query('INSERT INTO patient (PatientName, Email, Password, Age, Bloodgroup, PHONENUMBER, GENDER, Aadhar_number, Address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, age, bloodgroup, phoneNumber, gender, aadharNo, address],
            (error, results) => {
                if (error) {
                    console.error(error);
                    if (error.code === 'ER_DUP_ENTRY') {
                        // Duplicate entry error
                        let message = "";
                        if (error.message.includes("Email")) {
                            message += "Email already exists";
                        } 
                        res.status(400).json({ message });
                        console.log(message);
                    } else {
                        // Other internal server errors
                        res.status(500).json({ message: "Internal server error" });
                    }
                } else {
                    res.status(201).json({ message: "User registered successfully" });
                }
            });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});


   
app.post('/api/login', async (req, res) => {
    const { patientEmail, password } = req.body;

    try {
        // Check if the user exists
        db.query('SELECT * FROM patient WHERE Email = ?',
            [patientEmail],
            async (error, results) => {
                if (error) {
                    console.error(error);
                    return res.status(500).json({ message: "Internal server error" });
                }

                // Check if results array is empty
                if (results.length === 0) {
                    return res.status(400).json({ message: "User not found" });
                }

                // User found, compare passwords
                const user = results[0];
                console.log('Hashed Password:', user.Password); // Log hashed password from the database
                console.log('Provided Password:', password); // Log password provided in the request
                const passwordMatch = await bcrypt.compare(password, user.Password);
                console.log('Password Match:', passwordMatch); // Log whether passwords match
                if (!passwordMatch) {
                    return res.status(400).json({ message: "Incorrect password" });
                }

                // Generate JWT token
                  const accessToken=createTokens(user);                // Set token in cookie
                res.cookie('accessToken', accessToken, { httpOnly: true, sameSite:'strict', },{maxAge:60*60*24*30*1000,});
                res.json({ message: "Login successful" });
            });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Protected route
app.get('/api/home', validateToken, (req, res) => {
    // Return user credentials
    res.json({ user: req.user });
});
  

// Logout endpoint
app.get('/api/logout', (req, res) => {
    res.clearCookie('accessToken').json({ message: "Logout successful" });
});

app.use('/api/home', (req, res, next) => {
    res.status(401).json({ message: "Unauthorized" });
}); 

app.get('/api/departments', (req, res) => {
    // Query to fetch distinct departments from the doctor table
    const query = 'SELECT DISTINCT doc_dept AS department FROM doctor';

    // Execute the query
    db.query(query, (error, results) => {
        if (error) {
            console.error("Error fetching departments:", error);
            res.status(500).json({ error: "Internal server error" });
            return;
        }

        // Extract departments from the results
        const departments = results.map(row => row.department);
console.log(departments);
        // Send the list of departments as a response
        res.json(departments);
    });
});


app.get('/api/doctors/:department', (req, res) => {
    const department = req.params.department;
    const query = 'SELECT doc_id,doc_name,doc_qualification,doc_specification FROM doctor WHERE doc_dept = ?';

    db.query(query, [department], (error, results) => {
        if (error) {
            console.error(`Error fetching doctors for department ${department}:`, error);
            res.status(500).json({ error: "Internal server error" });
            return;
        }
         console.log(results);
        res.json(results);
    });
});


app.get('/api/slots', (req, res) => {
    const { date, doctorId } = req.query;

    const currentTimestamp = new Date().toISOString().split('.')[0];

    const query = `
        SELECT *
        FROM slots
        WHERE slot_occupied = 0 
        AND slot_date = ?
        AND CONCAT(slot_date, ' ', slot_time) >= ?
        AND doc_id = ?
    `;

    db.query(query, [date, currentTimestamp, doctorId], (error, results) => {
        if (error) {
            console.error('Error fetching slots:', error);
            res.status(500).json({ error: "Internal server error" });
            return;
        }
        if (results.length === 0) {
            console.log("No slots available");
        }

        console.log(results);
        res.json(results);
    });
});



app.post('/api/confirmappointment', (req, res) => {
    const { patientId, doctorId, appointmentTime, appointmentDate } = req.body;
    // Insert into appointments table
    db.query('INSERT INTO appointments (patient_id, doc_id, appointment_time, appointment_date, appointment_status) VALUES (?, ?, ?, ?, ?)', [patientId, doctorId, appointmentTime, appointmentDate, 'Confirmed'], (error, results) => {
        if (error) {
            console.error('Error inserting appointment:', error);
            res.status(500).json({ message: "Internal server error" });
            return;
        }
        // Update slots table
        db.query('UPDATE slots SET slot_occupied = ? WHERE doc_id = ? AND slot_date = ? AND slot_time = ?', [1, doctorId, appointmentDate, appointmentTime], (error, results) => {
            if (error) {
                console.error('Error updating slots:', error);
                res.status(500).json({ message: "Internal server error" });
                return;
            }
            res.status(200).json({ message: "Appointment confirmed successfully" });
        });
    });
});







app.listen(3001, () => {
    console.log("Server is running on port 3001");
});
