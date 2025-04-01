document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    fetchSongs();
    fetchPlaylists();

    document.getElementById('createPlaylist').addEventListener('click', createPlaylist);
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

function fetchSongs() {
    fetch('/songs')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch songs');
            return response.json();
        })
        .then(songs => {
            const songList = document.getElementById('songs');
            songList.innerHTML = '';
            
            songs.forEach(song => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${song.title} - ${song.artist}</span>
                    <button class="play-btn" data-file="${song.filePath}">Play</button>
                    <button class="add-to-playlist" data-song-id="${song.id}">Add to Playlist</button>
                `;
                songList.appendChild(li);
            });

            // Add event listeners to play buttons
            document.querySelectorAll('.play-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    playSong(e.target.getAttribute('data-file'));
                });
            });

            // Add event listeners to add to playlist buttons
            document.querySelectorAll('.add-to-playlist').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const songId = e.target.getAttribute('data-song-id');
                    showPlaylistSelection(songId);
                });
            });
        })
        .catch(error => {
            console.error('Error fetching songs:', error);
        });
}

function fetchPlaylists() {
    fetch('/playlists', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to fetch playlists');
        return response.json();
    })
    .then(playlists => {
        const playlistsContainer = document.getElementById('playlistsContainer');
        playlistsContainer.innerHTML = '';

        if (playlists.length === 0) {
            playlistsContainer.innerHTML = '<p>No playlists yet. Create one!</p>';
            return;
        }

        playlists.forEach(playlist => {
            const playlistDiv = document.createElement('div');
            playlistDiv.className = 'playlist';
            playlistDiv.innerHTML = `
                <h3>${playlist.name}</h3>
                <ul class="playlist-songs" id="playlist-${playlist.id}"></ul>
            `;
            playlistsContainer.appendChild(playlistDiv);

            // Add songs to the playlist
            const playlistSongs = document.getElementById(`playlist-${playlist.id}`);
            if (playlist.songs && playlist.songs.length > 0) {
                playlist.songs.forEach(song => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${song.title} - ${song.artist}</span>
                        <button class="play-btn" data-file="${song.filePath}">Play</button>
                    `;
                    playlistSongs.appendChild(li);
                });

                // Add event listeners to playlist song play buttons
                playlistSongs.querySelectorAll('.play-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        playSong(e.target.getAttribute('data-file'));
                    });
                });
            } else {
                playlistSongs.innerHTML = '<li>No songs in this playlist</li>';
            }
        });
    })
    .catch(error => {
        console.error('Error fetching playlists:', error);
    });
}

function createPlaylist() {
    const name = document.getElementById('playlistName').value.trim();
    if (!name) {
        alert('Please enter a playlist name');
        return;
    }

    fetch('/playlists', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to create playlist');
        return response.json();
    })
    .then(() => {
        document.getElementById('playlistName').value = '';
        fetchPlaylists();
    })
    .catch(error => {
        console.error('Error creating playlist:', error);
        alert('Failed to create playlist');
    });
}

function showPlaylistSelection(songId) {
    fetch('/playlists', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to fetch playlists');
        return response.json();
    })
    .then(playlists => {
        if (playlists.length === 0) {
            alert('Please create a playlist first');
            return;
        }

        const playlistNames = playlists.map(p => p.name);
        const playlistId = playlists[0].id; // Default to first playlist

        const selectedPlaylist = prompt(`Add to which playlist?\n\n${playlistNames.join('\n')}`, playlistNames[0]);
        if (!selectedPlaylist) return;

        const playlist = playlists.find(p => p.name === selectedPlaylist);
        if (!playlist) {
            alert('Invalid playlist selection');
            return;
        }

        addSongToPlaylist(playlist.id, songId);
    })
    .catch(error => {
        console.error('Error showing playlist selection:', error);
    });
}

function addSongToPlaylist(playlistId, songId) {
    fetch(`/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ songId })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to add song to playlist');
        return response.json();
    })
    .then(() => {
        fetchPlaylists();
    })
    .catch(error => {
        console.error('Error adding song to playlist:', error);
        alert('Failed to add song to playlist');
    });
}

function playSong(filePath) {
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.src = filePath;
    audioPlayer.play();
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}