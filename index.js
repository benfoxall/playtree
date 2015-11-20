var neo4j = require('neo4j');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

// yup, lets use "neo" as a password locally
var db = new neo4j.GraphDatabase('http://neo4j:neo@localhost:7474');

app.use(express.static('public'));
app.use(bodyParser.urlencoded());

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
    var result = results[0];
    res.send(results);
  });
});

app.get('/:id', function(req, res){
    db.cypher({
      query: 'MATCH (x-[*0..25]->n) WHERE id(n)={id} RETURN x',
      params: {
        id: parseInt(req.params.id)
      },
    }, function(err, results) {
      if (err) throw err;
      res.send(results);
    });
});

app.post('/:id', function(req, res){
    db.cypher({
      query: 'MATCH (p) WHERE id(p)={id} CREATE (n:track { uri: {uri}, why: {why} }), (p)-[:PARENT]->(n) RETURN n',
      params: {
        id: parseInt(req.params.id),
        uri: 'foo' + req.body.track,
        why: req.body.why
      },
    }, function(err, results) {
      if (err) throw err;
      res.send(results);
    });
});

app.listen(3000);
