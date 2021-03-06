require('dotenv').load();

var neo4j = require('neo4j');
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var request = require('request-promise');
var SpotifyStrategy = require('passport-spotify').Strategy;
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var Redis = require('ioredis');
var app = express();

// yup, lets use "neo" as a password locally
var db = new neo4j.GraphDatabase(process.env.GRAPHENEDB_URL || 'http://neo4j:neo@localhost:7474');
var redis = new Redis(process.env.REDISTOGO_URL);

// serve static files without auth
app.use(express.static('public'));

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
passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(obj, done) {
  db.cypher({
    query: 'MATCH (user:user) WHERE id(user)={userId} RETURN user',
    params: {
      userId: obj
    }
  }, function(err, results){
    done(err, (Array.isArray(results) ? results[0] : results).user)
  });
});

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
      query: 'MERGE (user:user {spotifyId: {spotifyId} }) '+
        'SET user.displayName={displayName}, user.photos={photos}, user.accessToken={accessToken}, user.refreshToken={refreshToken} '+
        'RETURN user',
      params: {
        spotifyId: profile.id,
        displayName: profile.displayName,
        photos: profile.photos,
        accessToken: accessToken,
        refreshToken: refreshToken
      },
    }, function(err, response){
      done(err, response && response[0] && response[0].user);
    });
  }
));


app.get('/auth', passport.authenticate('spotify', {scope: ['user-read-private']}));

app.get('/callback',
  passport.authenticate('spotify', { failureRedirect: '/?failed' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.get('/access-token', function(req, res, next){
  if(!req.user) return res.status(401);

  request({
    uri: 'https://accounts.spotify.com/api/token',
    headers: {
      'Authorization': 'Basic ' + new Buffer(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    form: {
      grant_type: 'refresh_token',
      refresh_token: req.user.properties.refreshToken
    },
    method: 'post',
    json: true
  })
  .then(function(data){
    res.send(data.access_token);
    console.log(">", data)
  })
  .catch(next)

})


app.use(bodyParser.urlencoded({extended: true}));
app.set('views', './views');
app.set('view engine', 'jade');

app.get('/', function(req, res) {
  res.render('tree', {action: '', user: req.user});
});

app.post('/', function(req, res) {

  if(req.body.track){
    request({
      uri: 'https://api.spotify.com/v1/tracks/' + req.body.track,
      json: true
    })
      .then(function(track){
        db.cypher({
          query: 'MATCH (u) WHERE id(u)={userId} CREATE (n:track {props}), (u)-[:ADDED]->(n) RETURN n',
          params: {
            userId: req.user._id,
            props: {
              track_id: track.id,
              name: track.name,
              album: track.album && track.album.name,
              duration_ms: track.duration_ms,
              uri: track.uri,
              why: req.body.why || '-'
            }
          },
        }, function(err, results) {
          if (err) throw err;
          res.redirect(results[0].n._id);
        });

      })
  }

  // if(req.body.track)

  // todo-check
  console.log(req.body);

});

app.get('/:id', function(req, res, next){
    if(!parseInt(req.params.id)) return next();

    // TODO promisify
    var done, tracks, nextTracks;

    db.cypher({
      query: 'MATCH (user-[:ADDED]->track-[:PARENT*0..25]->n) WHERE id(n)={id} RETURN track, user',
      params: {
        id: parseInt(req.params.id)
      },
    }, function(err, _tracks) {
      if (err) return next(err);
      tracks = _tracks;
      if(done) render();
      done = true;
    });

    db.cypher({
      query: 'MATCH (n-[:PARENT]->track<-[:ADDED]-user) WHERE id(n)={id} RETURN track, user LIMIT 10',
      params: {
        id: parseInt(req.params.id)
      },
    }, function(err, _nextTracks) {
      if (err) return next(err);
      nextTracks = _nextTracks;
      if(done) render();
      done = true;
    });

    function render(){
      if(!tracks.length) return res.send(404);
      tracks.reverse();
      res.render('tree', { tracks: tracks, responseTracks: nextTracks, action: req.params.id, user: req.user });
    }

});

app.post('/:id', function(req, res, next){
    if(!parseInt(req.params.id)) return next();

    if(req.body.track){
      request({
        uri: 'https://api.spotify.com/v1/tracks/' + req.body.track,
        json: true
      }).then(function(track){
        db.cypher({
          query: 'MATCH (p) WHERE id(p)={id} MATCH (u) WHERE id(u)={userId} CREATE (n:track { props }), (p)-[:PARENT]->(n), (u)-[:ADDED]->(n) RETURN n',
          params: {
            userId: req.user._id,
            id: parseInt(req.params.id),
            props: {
              track_id: track.id,
              name: track.name,
              album: track.album && track.album.name,
              duration_ms: track.duration_ms,
              uri: track.uri,
              why: req.body.why || '-'
            }
          },
        }, function(err, results) {
          if (err) throw err;
          res.redirect(results[0].n._id);
        });
      })
    } else {
      next()
    }
});

app.listen(process.env.PORT || 3000);
