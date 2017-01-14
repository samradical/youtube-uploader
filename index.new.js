const Youtube = require("youtube-api"),
  fs = require("fs"),
  readJson = require("r-json"),
  Chance = require("chance"),
  UUID = require("uuid"),
  Lien = require("lien"),
  Logger = require("bug-killer"),
  opn = require("opn"),
  Q = require("bluebird"),
  prettyBytes = require("pretty-bytes");

var chance = new Chance();
var argv = require('yargs').argv;
var PATH = require('path');
var _ = require('lodash');
const colors = require('colors')

const DEFAULTS = {
  playlist: {
    title: '',
    description: ''
  },
  playlistItem: {

  }
}

const P = (() => {

  const EVENT_TYPES = {
    progress:'progress'
  }

  let events = {
    progress:null,
  }

  // Init lien server
  let server = new Lien({
    host: "localhost",
    port: 5000
  });


  function init(credentials, options = {}) {
    return new Q((resolve, reject) => {
      console.log(credentials);
      // Authenticate
      // You can access the Youtube resources via OAuth2 only.
      // https://developers.google.com/youtube/v3/guides/moving_to_oauth#service_accounts
      let oauth = Youtube.authenticate({
        type: "oauth",
        client_id: credentials.web.client_id,
        client_secret: credentials.web.client_secret,
        redirect_url: credentials.web.redirect_uris[0]
      });

      opn(oauth.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube",
          "https://www.googleapis.com/auth/youtubepartner",
          "https://www.googleapis.com/auth/youtube.force-ssl"
        ]
      }));

      // Handle oauth2 callback
      server.addPage("/oauth2callback", lien => {
        Logger.log("Trying to get the token using the following code: " + lien.query.code);
        oauth.getToken(lien.query.code, (err, tokens) => {

          if (err) {
            lien.lien(err, 400);
            return Logger.log(err);
            reject()
          }

          Logger.log("Got the tokens.");

          oauth.setCredentials(tokens);

          lien.end("Thanks! You can close this tab.");

          resolve()
        })
      });
    });
  }

  function upload(files, playlist, options = {}) {
    return new Q((resolve, reject) => {
      let _options = Object.assign({}, DEFAULTS, options)
      console.log(colors.green('-------- .upload() --------'));
      console.log(colors.yellow(`Playlist specified: ${playlist}`));
      console.log(colors.yellow(`${files.length} files`));
      if (playlist) {
        return _getPlaylistItems(playlist).then(existingItems => {
          return _beginUpload(files, existingItems, playlist, _options)
            .then(youtubeUploadItems => {
              resolve(youtubeUploadItems)
            })
        })
      } else {
        return _createPlaylist(_options).then(data => {
          return _beginUpload(files, [], data.id, _options)
            .then(youtubeUploadItems => {
              resolve(youtubeUploadItems)
            })
        })
      }
    })
  }

  function on(event, callback){

  }

  function _createPlaylist(options) {
    return new Q((resolve, reject) => {
      Youtube.playlists.insert({
        part: 'snippet,status',
        resource: {
          snippet: {
            title: options.playlist.title || chance.sentence(),
            description: options.playlist.description || chance.paragraph()
          },
          status: {
            privacyStatus: 'public'
          }
        }
      }, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        console.log(colors.green(`Made new playlist ${data.id}`));
        resolve(data)
      });
    })
  }

  function _beginUpload(files, existingItems = [], playlistId, options) {

    /*
    NEED A WAY TO SCAN FOR DUPES
    */
    console.log(files);
    return _uploadLocal(files, existingItems, playlistId, options)
      .then((youtubeItems) => {
        return youtubeItems
      })

    /*
     return _getAllChannelUploads()
       .then((uploadedItems) => {

         var dupes = []
         var toupload = []

         _.each(files, (localPath, i) => {
           let _has = false
           _.each(existingItems, obj => {
             let title = obj.title
             if (localPath.indexOf(title) > -1) {
               _has = true
               dupes.push(obj)
             }
           })
           if (!_has) {
             toupload.push(localPath)
           }
         })

         return _addToPlaylistDupes(dupes, existingItems, playlist, options)
           .then(() => {
             return _uploadLocal(toupload, existingItems, playlist, options)
               .then((youtubeItems) => {
                 return youtubeItems
               })
           })
       })*/
  }

  function _addToPlaylistDupes(dupes, existingItems, playlist, options) {
    return Q.map(dupes, (vo) => {
      return new Q((resolve, reject) => {
        if (playlist) {
          let _exists = false
          _.each(existingItems, o => {
            if (o.id === vo.id) {
              _exists = true
            }
          })
          if (_exists) {
            resolve()
            return
          }
          Youtube.playlistItems.insert({
            part: 'snippet,status',
            resource: {
              "snippet": {
                "playlistId": playlist,
                "resourceId": {
                  "kind": "youtube#video",
                  "videoId": vo.id
                }
              },
              status: {
                privacyStatus: 'public'
              }
            }
          }, (err, data) => {
            if (err) {
              reject(err)
              return
            }
            console.log(err);
            console.log("Done Inserting");
            resolve(data)
          });
        } else {
          resolve()
        }
      })
    }, { concurrency: 1 })
  }


  function _getAllChannelUploads() {
    return new Q((resolve, reject) => {
      Youtube.channels.list({
        part: 'contentDetails',
        mine: true
      }, (err, data) => {
        if (err) {
          console.log(err);
          reject(err)
          return
        }
        console.log(data);
        var uploadId = data.items[0].contentDetails.relatedPlaylists.uploads
        resolve(_getPlaylistItems(uploadId, 0))
      })
    })
  }


  function _uploadLocal(toupload, existingItems, playlist, options) {
    return Q.map(toupload, (vo) => {
      return new Q((resolve, reject) => {

        if (!fs.existsSync(vo)) {
          return resolve()
        }

        var _i
        var name = PATH.parse(vo).name
        console.log(colors.green(`Uploading ${vo}`));
        const fileByteSize = fs.statSync(vo).size
        if (fileByteSize < 5000) {
          reject(new Error(`Not a video ${vo}`))
          return
        }

        let title, description,privacyStatus;
        title = (options.playlistItem.title) || options.title || name
        description = (options.playlistItem.description) || options.description || ""
        privacyStatus = (options.playlistItem.privacyStatus) || options.privacyStatus || "public"

        var req = Youtube.videos.insert({
          resource: {
            // Video title and description
            snippet: {
              title: title,
              description: description,
              defaultLanguage: 'en',
              defaultAudioLanguage: 'en'
            }
            // I don't want to spam my subscribers
            ,
            status: {
              privacyStatus: privacyStatus
            }
          }
          // This is for the callback function
          ,
          part: "snippet,status"

          // Create the readable stream to upload the video
          ,
          media: {
            body: fs.createReadStream(vo)
          }
        }, (err, videoUploadData) => {

          if (err) {
            reject(err)
            return
          }
          let _id = videoUploadData.id
            //SUCCESSfUL_IDS.push(_id)
          Youtube.captions.insert({
            part: 'snippet',
            resource: {
              "kind": "youtube#caption",
              snippet: {
                "videoId": _id,
                "trackKind": 'ASR',
                "language": 'en',
                "name": 'pate english',
                "isDraft": true
              }
            }
          }, (err, data) => {
            console.log("Done Captioning");

            let _exists = false
            _.each(existingItems, o => {
              if (o.id === vo.id) {
                _exists = true
              }
            })
            if (_exists) {
              clearInterval(_i)
              resolve(videoUploadData)
              return
            }
            Youtube.playlistItems.insert({
              part: 'snippet,status',
              resource: {
                "snippet": {
                  "playlistId": playlist,
                  "resourceId": {
                    "kind": "youtube#video",
                    "videoId": _id
                  }
                },
                status: {
                  privacyStatus: 'public'
                }
              }
            }, (err, data) => {
              console.log("Done Inserting");
              clearInterval(_i)
              videoUploadData.playlistId = playlist
              resolve(videoUploadData)
            });
          });
          console.log("Done Uploading");
          clearInterval(_i)
        });

        _i = setInterval(() => {
          console.log(req.req.connection._bytesDispatched, fileByteSize);
          Logger.log(`${prettyBytes(req.req.connection._bytesDispatched)} bytes uploaded.`);
          _dispatchEvent(EVENT_TYPES.progress, req.req.connection._bytesDispatched)
        }, 250);

      })
    }, { concurrency: 1 })
  }

  function _getPlaylistItems(id, nextPageToken) {
    return new Q((resolve, reject) => {
      let _items = []

      function _loop(nextPageToken) {
        Youtube.playlistItems.list({
          part: 'snippet',
          playlistId: id,
          pageToken: nextPageToken || null,
          maxResults: 50
        }, (err, data) => {
          if (err) {
            reject(err)
            return
          }
          console.log(data);
          if (!data) {
            resolve(_items)
            return
          }
          let p = data.nextPageToken
          _.each(data.items, item => {
            _items.push({
              title: item.snippet.title,
              id: item.snippet.resourceId.videoId
            })
          })
          console.log(p);
          if (p) {
            _loop(p)
          } else {
            resolve(_items)
          }
        })
      }
      _loop()
    })
  }


  function _dispatchEvent(str, val){
    if(events[str]){
      events[str](val)
    }
  }


  return {
    init: init,
    getPlaylistItems: _getPlaylistItems,
    upload: upload,
    on: on
  }
})()


module.exports = P
