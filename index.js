const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken')
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();



const app = express();
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}))

//const port = 5000;

app.use(express.json());
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;



let db;

MongoClient.connect(MONGO_URI)
    .then(client => {
        db = client.db(DB_NAME);
        console.log('MongoDB connected');
    })
    .catch(err => console.error(err));

// //////////////////////////////////////////////////
console.log("MONGO_URI:", process.env.MONGO_URI);


function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    //console.log(authHeader)
    if (!authHeader)
        return res.status(401).json({ message: 'Token missing' });
    const token = authHeader.split(' ')[1];
    //console.log('hi')
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        req.userId = decoded.id;
        //console.log(req.userId);

        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid Token" })
    }
}



////////////////routing////////////////////


app.get('/', (req, res) => {
    res.send('Hello World!');
   

})

app.get("/signup", (req, res) => {
    res.send("okay")
})

app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if(!emailRegex.test(email)) return res.status(400).json({message : "invalid email format"})
        
        // const passLen = lens(password)
        // console.log(passLen)

        if(password.length < 6) return res.status(400).json({message: "password should min 8 char"})

        //const db = getDB();
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) return res.status(400).json({ message: "existingUser" })

        const hashedPassword = await bcrypt.hash(password, 10)

        const result = await db.collection('users').insertOne({
            name,
            email,
            password: hashedPassword
        })

        res.status(201).json({ message: 'User Registered Successfully' })

    } catch (error) {
        res.status(500).json({ message: error.message })
    }
});


app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if(!email || !password) return res.status(400).json({ message: 'Email and password are required' });

        if(!emailRegex.test(email)) return res.status(400).json({ message: 'Invalid email format' });

        
        const user = await db.collection('users').findOne({ email });

        if (!user) return res.status(401).json({ message: 'Invalid email' });

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id.toString() },
            JWT_SECRET
        )

        res.json(
            {
                token,
                user: {
                    name: user.name,
                    email: user.email
                }
            }
        )

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})




app.get('/user', authenticate, async (req, res) => {
    try {
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { password: 0 } }
        );
        //console.log(req)


        if (!user)
            return res.status(404).json({ message: 'User not found' });

        res.json({
            name: user.name,
            email: user.email
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/notes', authenticate, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text){
            return res.status(401).json("Event is empty")

        }
        const result = await db.collection('notes').insertOne({
            text,
            userId: new ObjectId(req.userId)
        })
        //console.log(`insertedid ${result.insertedId} ans text:  ${text} and userid: ${req.userId}`)
        res.json({
            _id: result.insertedId,
            text
        })
    } catch (error) {
        console.status(500).json({ msg: error.msg })
    }
})

app.get('/notes', authenticate, async (req, res) => {
    try {
        const notes = await db.collection('notes')
            .find({ userId: new ObjectId(req.userId) })
            .toArray();
        const test = await db.collection('notes')
            .find({ userId: new ObjectId(req.userId) })
        //console.log("notes:", notes)
        res.json(notes)

    } catch (error) {
        console.log(error)
    }
})


app.delete('/notes/:noteId', authenticate, async (req, res) => {
    try {
        const id = req.params.noteId
        //console.log("id: ", id)
        const mongoId = new ObjectId(id)
        //console.log("mongoid", mongoId)

        const result = await db.collection('notes').deleteOne({
            _id: mongoId,
            userId: new ObjectId(req.userId)
        })
        //console.log(`_id/mongoid: ${mongoId} and userID: ${req.userId}`)
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Note not found" });
        }
        res.status(200).json({ message: "Note deleted successfully" });
    } catch (error) {
        console.log(error)
    }
})


app.patch('/notes/:noteId', authenticate, async (req, res) => {
    try {
        const noteId = req.params.noteId;
        //console.log(noteId)
        const { text } = req.body;

        if (!ObjectId.isValid(noteId)) {
            return res.status(400).json({ message: "Invalid note ID" });
        }
        //console.log("req.userId:", req.userId);
        const note = await db.collection('notes').findOne({ _id: new ObjectId(noteId) });
        //console.log("note in DB:", note);


        const result = await db.collection('notes').findOneAndUpdate(
            { _id: new ObjectId(noteId), userId: new ObjectId(req.userId) },
            { $set: { text } },
            { returnDocument: "after" }
        );
        console.log("result", result._id)

        if (!result.text) {
            return res.status(404).json({ message: "Note not found" });
        }

        res.status(200).json({text : result.text, _id : result._id});
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
