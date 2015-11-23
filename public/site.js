// obviously, I'll totally re-write this
search.addEventListener('submit', function(e){
  e.preventDefault();

  var token = localStorage.getItem('token');
  var timeout = localStorage.getItem('timeout');

  if(!token || parseInt(timeout) < Date.now()){
    console.log("fetching access token")
    fetch('/access-token' , {credentials: 'same-origin'})
    .then(function(d){
      return d.text()
    })
    .then(function(token){
      localStorage.setItem('token', token);
      localStorage.setItem('timeout', Date.now()+60000);
      return token
    })
    .then(request)
  } else {
    request(token)
  }


  function request(token){

    var headers = new Headers()
    headers.append('Authorization', 'Bearer ' + token);

    fetch('https://api.spotify.com/v1/search?type=track&market=from_token&q=' + encodeURIComponent(query.value),
      { headers: headers })
    .then(function(d){return d.json()})
    .then(function(response){

      while(results.firstChild){
        results.removeChild(results.firstChild)
      }

      response.tracks.items.forEach(function(t){
        var a = document.createElement('a');
        a.href="#"
        // console.log(t)

        var s = document.createElement('span');
        s.className = 'title';
        s.innerText = t.name;
        a.appendChild(s)

        var s = document.createElement('span');
        s.className = 'artist';
        s.innerText = t.artists.map(function(d){return d.name}).join(', ');
        a.appendChild(s)

        var s = document.createElement('span');
        s.className = 'album';
        s.innerText = t.album.name;
        a.appendChild(s)


        a.addEventListener('click', function(e){
          e.preventDefault();
          console.log(t.id);
          document.getElementById('track_id').value=t.id
        }, false)

        var li = document.createElement('li');
        li.appendChild(a);
        results.appendChild(li)
      })

    })


  }
})
