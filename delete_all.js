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
const PLAYLIST = argv.p

const UPLOADED_IDS = []

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

        getAllChannelUploads().then(() => {
            console.log(UPLOADED_IDS);
            return Q.map(UPLOADED_IDS, (id) => {
                return new Q((resolve, reject) => {
                    Youtube.videos.delete({
                        id: id
                    }, (err, data) => {
                        console.log(data);
                        resolve()
                    })
                })
            }, {
                concurrency: 1
            })

        })
    })

});


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

        function _loop(nextPageToken) {
            Youtube.playlistItems.list({
                part: 'snippet',
                playlistId: id,
                pageToken: nextPageToken || null,
                maxResults: 50
            }, (err, data) => {
                let p = data.nextPageToken
                _.each(data.items, item => {
                    UPLOADED_IDS.push(item.snippet.resourceId.videoId)
                })
                if (p) {
                    _loop(p)
                } else {
                    resolve()
                }
            })
        }

        _loop()


    })
}