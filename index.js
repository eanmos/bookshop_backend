const fs = require('fs')
const path = require('path')
const https = require('https')
const cookieParser = require("cookie-parser")
const express = require('express')
const app = express()
const cors = require('cors')
const { MongoClient, ObjectId } = require("mongodb")
const session = require('express-session')
const uuid = require('uuid')

const address = "0.0.0.0"
const port = 443

const certificate = fs.readFileSync("/root/bookshop-backend/sslcert/cert.pem", { encoding: "utf8" })
const privateKey = fs.readFileSync("/root/bookshop-backend/sslcert/privkey.pem", { encoding: "utf8" })
const chain = fs.readFileSync("/root/bookshop-backend/sslcert/chain.pem", { encoding: "utf8" })
const credentials = {key: privateKey, cert: certificate, ca: chain}

const client = new MongoClient("mongodb+srv://user:user@cluster0.5ksjv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

client.connect((err, connection) => {
  // Log database connection
  if (err || !connection)
    console.error(err)
  else
    console.log("Successfully connected to MongoDB")

  // Get database collections
  let db = client.db('bookshop')
  let collections = {
    users: db.collection('users'),
    books: db.collection('books'),
    orders: db.collection('orders')
  }

  app.use(express.static(path.join(__dirname, 'client/build')))

  // Enable JSON and CORS middlewares
  app.use(express.json())
  app.use(cors({ origin: true, credentials: true }))

  // Enable session management
  app.use(session({
    name: 'bs_session',
    secret: 'keyboard cat',
    genid: (req) => uuid.v4(),
    saveUninitialized: false,
    resave: false,
    cookie: {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000
    }
  }))

  app.use(cookieParser())

  // Log every request
 // app.use((req, res, next) => {
 //   console.log('\n-----------------------------------')
 //   console.log(req.session)
 //   console.log('Time:', Date.now())
 //   next()
 // })

// app.get('/denis', (req, res) => {
// 	res.send("Дунаев Денис лох.\nЯ хожу с фальшивым QR-кодом.")
// })

  app.post('/makeOrder', (req, res) => {
    console.debug(`(/makeOrder): ${JSON.stringify(req.body)}`)

    const order = {
      userId: req.session.userId,
      books: req.body.books,
      datetime: new Date()
    }

    collections.orders.insertOne(order).then(result => {
      for (const b of order.books) {
        const prevCount = collections.books.findOne({ _id: new ObjectId(b.id) }).then(result => {
          collections.books.findOneAndUpdate(
            { _id: new ObjectId(b.id) },
            { $set: { count: result.count - b.count }},
            { upsert: false }
          ).then(result => {}).catch(e => console.error(e))
        })
      }
    }).catch(e => console.error(e))

    res.end(JSON.stringify({ success: true }))
  })

  // Get user orders
  app.get('/getUserOrders', (req, res) => {
    collections.users.findOne({ _id: req.session.userId })
    .then(result => {
      collections.orders.find({ userId: req.session.userId }).toArray()
      .then(results => {
        res.json(results)
      }).catch(e => console.error(e))
    })
  })

  // Register new user
  app.post('/signUp', (req, res) => {
    //console.debug(`(/signUp): ${JSON.stringify(req.body)}`)
    const { username, email, password } = req.body

    // TODO: check if such user already exists

    collections.users.insertOne({
      username: username,
      email: email,
      password: password
    }).then(result => {
      //console.log(result)
    }).catch(e => console.error(e))

    res.end(JSON.stringify({
      status: "ok"
    }))
  })

  // Sign in
  app.post('/signIn', (req, res) => {
    //console.debug(`(/signIn): ${JSON.stringify(req.body)}`)
    const { email, password } = req.body

    collections.users.findOne({ email: email, password: password })
    .then(result => {
      //console.debug('(/signIn): success')

      // Set up session
      req.session.signedIn = true
      req.session.email = result.email
      req.session.userId = result._id

      console.log(req.session.email)
      console.log(req.session.userId)

     //console.log('===================================================================\n')
     //console.log(req.session)

      res.json(JSON.stringify({
        success: true
      }))
    })
    .catch(e => {
     // console.debug('(/signIn): exception')

      res.json(JSON.stringify({
        success: false
      }))
    })
  })

  // Get user info
  // Allowed for client when user is signed in
  // and client has established session
  app.get('/userInfo', (req, res) => {
    //console.debug(`(/userInfo): ${JSON.stringify(req.session)}`)

    if (!req.session.email)
      res.json(JSON.stringify({ success: false }))

    collections.users.findOne({ email: req.session.email })
    .then(result => {
     //console.debug('(/userInfo): success')
     //console.log(req.session)
     //console.log(result)

      res.json(JSON.stringify({
        success: true,
        username: result.username,
        email: result.email
      }))
    })
    .catch(e => {
      //console.debug('(/userInfo): exception')
    })
  })

  app.post('/orderDetails', (req, res) => {
	  console.log(req.body)
    collections.orders.findOne({ _id: new ObjectId(req.body.id) })
    .then(result => {
	    console.log(result)
      res.json(JSON.stringify(result))
    })
    .catch(e => {
      //console.debug('(/userInfo): exception')
    })
  })

  app.get('/getBooks', (req, res) => {
//	console.debug(`(/getBooks)`)

	collections.books.find().toArray()
	.then(results => {
		results.forEach((r) => r.id = r._id)
		res.json(results)
	})
	.catch(e => console.error(e))
  })

  // Handles any requests that don't match the ones above
  app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname + '/client/build/index.html'))
  })

  // Start server
  https.createServer(credentials, app).listen(port, address, () => {
    console.log(`Server listening at https://${address}:${port}`)
  })
})
