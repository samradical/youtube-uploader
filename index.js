/**
 * This script uploads a video (specifically `video.mp4` from the current
 * directory) to YouTube,
 *
 * To run this script you have to create OAuth2 credentials and download them
 * as JSON and replace the `credentials.json` file. Then install the
 * dependencies:
 *
 * npm i r-json lien opn bug-killer
 *
 * Don't forget to run an `npm i` to install the `youtube-api` dependencies.
 * */

const Youtube = require("youtube-api"),
    fs = require("fs"),
    readJson = require("r-json"),
    Lien = require("lien"),
    Logger = require("bug-killer"),
    opn = require("opn"),
    Q = require("bluebird"),
    prettyBytes = require("pretty-bytes");

var argv = require('yargs').argv;
var PATH = require('path');
var _ = require('lodash');
// I downloaded the file from OAuth2 -> Download JSON
const CREDENTIALS = readJson(`${__dirname}/credentials.json`);
let _upload = argv.manifest
if (!_upload) {
    throw new Error('--manifest...')
    process.exit()
}
let UPLOADS = readJson(`${__dirname}/${_upload}`);
const PLAYLIST = argv.p

let SUCCESSfUL_IDS = []
let UPLOADED_DATA = []
let EXISTING_PLAYLIST_DATA = []

// Init lien server
let server = new Lien({
    host: "localhost",
    port: 5000
});

// Authenticate
// You can access the Youtube resources via OAuth2 only.
// https://developers.google.com/youtube/v3/guides/moving_to_oauth#service_accounts
let oauth = Youtube.authenticate({
    type: "oauth",
    client_id: CREDENTIALS.web.client_id,
    client_secret: CREDENTIALS.web.client_secret,
    redirect_url: CREDENTIALS.web.redirect_uris[0]
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
        }

        Logger.log("Got the tokens.");

        oauth.setCredentials(tokens);

        lien.end("The video is being uploaded. Check out the logs in the terminal.");

        if (PLAYLIST) {
            getPlaylistItems(PLAYLIST).then(items => {
                EXISTING_PLAYLIST_DATA = items
                begin()
            }).finally()
        } else {
            begin()
        }



    })
});

function begin() {

    getAllChannelUploads().then((items) => {

        UPLOADED_DATA = items

        var dupes = []
        var toupload = []

        _.each(UPLOADS, (localPath, i) => {
            let _has = false
            _.each(UPLOADED_DATA, obj => {
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


        _addToPlaylistDupes(dupes)
            .then(() => {
                return _uploadLocal(toupload).then(() => {
                    console.log("ALL DONE");
                    process.exit()
                })
            })
    })
}



function _uploadLocal(toupload) {
    return Q.map(toupload, (vo) => {
        return new Q((resolve, reject) => {
            if (!fs.existsSync(vo)) {
                return resolve()
            }
            console.log(vo);
            var name = PATH.parse(vo).name
            var req = Youtube.videos.insert({
                resource: {
                    // Video title and description
                    snippet: {
                        title: name,
                        defaultLanguage: 'en',
                        defaultAudioLanguage: 'en'
                    }
                    // I don't want to spam my subscribers
                    ,
                    status: {
                        privacyStatus: "public"
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
            }, (err, data) => {
                clearInterval(_i)
                if(err){
                    resolve()
                    return
                }
                let _id = data.id
                SUCCESSfUL_IDS.push(_id)
                console.log(_id);
                Youtube.captions.insert({
                    part: 'snippet',
                    /* snippet: {
                         "videoId": _id,
                         "trackKind": 'ASR',
                         "language": 'en-GB',
                         "isDraft": false,
                         "name": 'sam-auto-track',
                     },*/
                    /*resource: {
                        snippet: {
                            "videoId": _id,
                            "trackKind": 'ASR',
                            "language": 'en-GB',
                            "isDraft": false,
                            "name": 'sam-auto-track',
                        }
                    },*/
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
                    if (PLAYLIST) {
                        let _exists = false
                        _.each(EXISTING_PLAYLIST_DATA, o => {
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
                                    "playlistId": PLAYLIST,
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
                            console.log(err);
                            console.log("Done Inserting");
                            resolve()
                        });
                    } else {
                        resolve()
                    }

                });

                console.log(data);
                console.log("Done Uploading");
            });

            var _i = setInterval(function() {
                Logger.log(`${prettyBytes(req.req.connection._bytesDispatched)} bytes uploaded.`);
            }, 250);

        })
    }, { concurrency: 1 })
}


function _addToPlaylistDupes(dupes) {
    return Q.map(dupes, (vo) => {
        return new Q((resolve, reject) => {
            if (PLAYLIST) {
                let _exists = false
                _.each(EXISTING_PLAYLIST_DATA, o => {
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
                            "playlistId": PLAYLIST,
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
                    console.log(err);
                    console.log("Done Inserting");
                    resolve()
                });
            } else {
                resolve()
            }
        })
    }, { concurrency: 1 })
}






















function getAllChannelUploads() {
    return new Q((resolve, reject) => {
        Youtube.channels.list({
            part: 'contentDetails',
            mine: true
        }, (err, data) => {
            var uploadId = data.items[0].contentDetails.relatedPlaylists.uploads
            resolve(getPlaylistItems(uploadId, 0))
        })
    })
}

function getPlaylistItems(id, nextPageToken) {
    return new Q((resolve, reject) => {
        let _items = []

        function _loop(nextPageToken) {
            Youtube.playlistItems.list({
                part: 'snippet',
                playlistId: id,
                pageToken: nextPageToken || null,
                maxResults: 50
            }, (err, data) => {
                console.log(data);
                if(!data){
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