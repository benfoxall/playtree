var neo4j = require('neo4j');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

// yup, lets use "neo" as a password locally
var db = new neo4j.GraphDatabase('http://neo4j:neo@localhost:7474');

app.use(express.static('public'));
app.use(bodyParser.urlencoded());

app.set('views', './views');
app.set('view engine', 'jade');

app.get('/', function(req, res) {
  res.render('tree', {action: '' });
});

app.post('/', function(req, res) {

  // todo-check
  console.log(req.body);

  db.cypher({
    query: 'CREATE (n:track { uri: {uri}, why: {why} }) RETURN n',
    params: {
      uri: req.body.track,
      why: req.body.why
    },
  }, function(err, results) {
    if (err) throw err;
    res.redirect(results[0].n._id);
  });
});

app.get('/:id', function(req, res){
    db.cypher({
      query: 'MATCH (track-[*0..25]->n) WHERE id(n)={id} RETURN track',
      params: {
        id: parseInt(req.params.id)
      },
    }, function(err, tracks) {
      if (err) throw err;
      tracks.reverse();
      res.render('tree', { tracks: tracks, action: req.params.id });
    });
});

app.post('/:id', function(req, res){
    db.cypher({
      query: 'MATCH (p) WHERE id(p)={id} CREATE (n:track { uri: {uri}, why: {why} }), (p)-[:PARENT]->(n) RETURN n',
      params: {
        id: parseInt(req.params.id),
        uri: req.body.track,
        why: req.body.why
      },
    }, function(err, results) {
      if (err) throw err;
      res.redirect(results[0].n._id);
    });
});

app.listen(3000);
