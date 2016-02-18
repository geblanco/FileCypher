#!/usr/bin/env node

'use strict'

// Dependencies
var encryptor = require('file-encryptor');
var fs 		  = require('fs');
var archiver  = require('archiver');
var async 	  = require('async');
var upath 	  = require('upath');
var os 		  = require('os');
var prompt 	  = require('prompt');
var program   = require('commander');

// Variables
var opt, fd, name, key;
var options = { algorithm: 'aes256' };

var _checkOut = function( fd ){
	var tmp = fd.split('/');
	var rest = tmp.pop();
	return _checkFile( tmp.join('/') ) + '/' + rest;
}
var _checkFile = function( descr ){
	fd = {};
	try{
		fd.stat = fs.lstatSync( descr );
		fd.file = descr;
		return descr;
	}catch( e ){
		console.log('Invalid file');		
		return false;
	}
}

// Parse command line
program
  .version('0.0.1')
  .option('-c, -C, --cypher [type]', 'Cypher type (encrypt/decrypt) file/directory', /^(e|d)$/i)
  .option('-f, --file [absolute path]', 'File/directory to cypher/decypher', _checkFile)
  .option('-o, --out [absolute path]', 'Destination file', _checkOut)
  .parse(process.argv);

if( !process.argv.slice(2).length || (!program.file || !program.C) ){
	program.help();
	process.exit(1);
}

//file = program.file;
opt  = program.C;
name = program.out

if( !program.out ){
	if( fd.stat.isDirectory() ){
		name = fd.file;
	}else{
		var tmpP = fd.file.split('/');
		var tmpN = tmpP.pop();
		tmpN = tmpN.split('.');
		if( tmpN.length > 1 ){
			tmpN.pop();
			tmpN = tmpN.join('-');
		}
		name = tmpP.join('/') + '/' + tmpN;
	}
}

console.log('\nThis is a BETA program, try not to erase original files until this program is totally tested\n');

async.waterfall([
	function( callback ){
		// Aquire password
		prompt.start();
		prompt.get([{
			name: 'password',
			hidden: true,
		    replace: '*',
		    required: true 
		}], function( err, result ){
			key = result.password;
			callback( null, fd );
		});
	},
	/*function( callback ){
		fs.stat( file, function( err, stat ){
			if( err ){
				console.log('Bad file, please use absolute paths (drop the directory over the terminal)');
				callback( err );
			}else{
				callback( null, { file: file, isDir: stat.isDirectory() });
			}
		});
	},*/
	function( dir, callback ){
		if( opt.trim() === 'd' ){
			return callback( null, dir.file );
		}
		var tmpDir = upath.join( __dirname, 'target.zip' );
		var tmpOut = fs.createWriteStream( tmpDir );
		var archive = archiver('zip');

		console.log('Compressing...');

		tmpOut.on('close', function () {
			console.log('Done');
			callback( null, tmpDir );
		});

		archive.on('error', function(err){
		    console.log('Compressing error', err);
		    callback( err );
		});

		archive.pipe( tmpOut );
		
		if( dir.stat.isDirectory() ){
			archive.bulk([
			    { expand: true, cwd: dir.file, src: ['**.*'], dest: tmpDir }
			]);
		}else{
			// Prepare file
			var name = dir.file.split('/');
			name = name[ name.length -1 ];
			archiver.append(fs.createReadStream( dir.file ), { name: name });
		}
		archive.finalize();
	},
	function( fd, callback ){

		if( opt.trim() === 'e' ){
			console.log('Encrypting...');
			encryptor.encryptFile(fd, name + '.enc', key, options, function( err ){
			  	if( err ){
			  		console.log('There was an error', err);
			  	}else{
			  		console.log('Done');
			  	}
			  	callback( err || null, fd );
			});
		}else{
			console.log('Decrypting...');
			encryptor.decryptFile(fd, name + '.zip', key, options, function( err ){
			  	if( err ){
			  		console.log('There was an error', err);
			  	}else{
			  		console.log('Done');
			  	}
			  	callback( err || null, fd );
			});
		}

	}
], function( err, fd ){
	if( fd ){
		console.log('Cleaning...');
		fs.unlink(fd, function( err ){
			if( err ){
				console.log('Error', err);
			}else{
				console.log('Done!! Good to go');
			}
		})
	}else{
		console.log(err);
	}
})