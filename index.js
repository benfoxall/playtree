require('dotenv').load();

var neo4j = require('neo4j');
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var SpotifyStrategy = require('passport-spotify').Strategy;
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var Redis = require('ioredis');
var app = express();

// yup, lets use "neo" as a password locally
var db = new neo4j.GraphDatabase(process.env.GRAPHENEDB_URL || 'http://neo4j:neo@localhost:7474');
var redis = new Redis(process.env.REDISTOGO_URL);

var opts = {
  resave:false,
  saveUninitialized:true,
  store: new RedisStore({
    client: redis
  }),
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  cookie: {path: '/', secure: false}
};

if (app.get('env') === 'production') {
  app.set('trust proxy', 1);
  opts.cookie.secure = true;
}

// just persist the whole thing in the session for now (won't be on the client)
passport.serializeUser(function(user, done) { done(null, user); });
passport.deserializeUser(function(obj, done) { done(null, obj); });

app.use(session(opts));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new SpotifyStrategy({
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret:  process.env.SPOTIFY_CLIENT_SECRET,
    callbackURL: process.env.SPOTIFY_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    console.log(profile);
    db.cypher({
      query: 'MERGE (user:user { spotifyId: {spotifyId}, displayName: {displayName}, photos: {photos} }) RETURN user',
      params: {
        spotifyId: profile.id,
        displayName: profile.displayName,
        photos: profile.photos,
      },
    }, function(err, response){
      done(err, response[0].user);
    });
  }
));


app.get('/auth', passport.authenticate('spotify'));

app.get('/callback',
  passport.authenticate('spotify', { failureRedirect: '/?failed' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});


app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.set('views', './views');
app.set('view engine', 'jade');

app.get('/', function(req, res) {
  res.render('tree', {action: '', user: req.user});
});

app.post('/', function(req, res) {

  // todo-check
  console.log(req.body);

  db.cypher({
    query: 'MATCH (u) WHERE id(u)={userId} CREATE (n:track { uri: {uri}, why: {why}}), (u)-[:AUTHOR]->(n) RETURN n',
    params: {
      userId: req.user._id,
      uri: req.body.track,
      why: req.body.why
    },
  }, function(err, results) {
    if (err) throw err;
    res.redirect(results[0].n._id);
  });
});

app.get('/:id', function(req, res, next){
    if(!parseInt(req.params.id)) return next();
    db.cypher({
      query: 'MATCH (user-[:ADDED]->track-[:PARENT*0..25]->n) WHERE id(n)={id} RETURN track, user',
      params: {
        id: parseInt(req.params.id)
      },
    }, function(err, tracks) {
      if (err) throw err;
      if(!tracks.length) return res.send(404);
      tracks.reverse();
      res.render('tree', { tracks: tracks, action: req.params.id, user: req.user });
    });
});

app.post('/:id', function(req, res){
    if(!parseInt(req.params.id)) return next();
    db.cypher({
      query: 'MATCH (p) WHERE id(p)={id} MATCH (u) WHERE id(u)={userId} CREATE (n:track { uri: {uri}, why: {why} }), (p)-[:PARENT]->(n), (u)-[:ADDED]->(n) RETURN n',
      params: {
        userId: req.user._id,
        id: parseInt(req.params.id),
        uri: req.body.track,
        why: req.body.why
      },
    }, function(err, results) {
      if (err) throw err;
      res.redirect(results[0].n._id);
    });
});

app.listen(process.env.PORT || 3000);
