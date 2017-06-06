let U = require('./index')
const fs = require('fs')
var readDir = require('readdir');
const PLAYLIST_ID = "PLRQ2jIXShfkYpgReIxERGoqTorUoU-Hm2"
let _cred = JSON.parse(fs.readFileSync('credentials_samuelradelie.json'))


let files =  readDir.readSync('/Volumes/Fatboy/Pictures/iPhone2016', ['**.mp4','**.MOV','**.mov', '**.AVI'], readDir.ABSOLUTE_PATHS);

U.init(_cred).then(()=>{
	U.upload(files,PLAYLIST_ID)
  .then(upload=>{
		console.log(upload);
    process.exit()
	})
})


/*
SINGLE FILE WITH ACCESS TOKEN CREDS

let options = {
        credentials: arg.credentials,
        title: arg.title,
        privacyStatus: arg.privacy,
        description: arg.description
      }

      return Uploader.upload([arg.local],
          YOUTUBE_RENDER_PLAYLIST,
          options)
        .then(uploaded => {
          //id
        })
        .finally()

*/
