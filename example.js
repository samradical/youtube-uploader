let U = require('./index.new')
const fs = require('fs')
var readDir = require('readdir');
let _cred = JSON.parse(fs.readFileSync('client_tubechewb.json'))
let files =  readDir.readSync('../movie-splitter', ['**.avi'], readDir.ABSOLUTE_PATHS);
U.init(_cred).then(()=>{
	U.upload(files).then(upload=>{
		console.log(upload);
	})
})