// obviously, I'll re-write this
search.addEventListener('submit', function(e){
  e.preventDefault();

  var token = document.querySelector('[data-access-token]').dataset.accessToken;

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
      var li = document.createElement('li');
      console.log(t)

      li.innerText =
        t.name + ' - ' +
        t.artists.map(function(d){return d.name}).join(', ') + ' - ' +
        t.album.name;

      li.addEventListener('click', function(){
        console.log(t.id);
        document.getElementById('track_id').value=t.id
      }, false)
      results.appendChild(li)
    })

  })

})
