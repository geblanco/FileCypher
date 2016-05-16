#!/usr/bin/env node

'use strict'

// Dependencies
var encryptor = require('file-encryptor');
var fs 		  	= require('fs-extra');
var os 		  	= require('os');
var archiver  = require('archiver');
var async 	  = require('async');
var upath 	  = require('upath');
var os 		  	= require('os');
var prompt 	  = require('prompt');
var program   = require('commander');
var AdmZip 		= require('adm-zip');

// Variables
// Encryption/Decryption ('e'/'d')
var opt;
// Whether to clean the original file or not
var clean = false;
var cleanFiles = [];
/*
File descriptor {
	stat: stats from the file
	file: path -> Todo this should be named path
}
*/
var fd;
// Output dir
var outDir;
// Password for the file
var key;
var options = { algorithm: 'aes256' };

var _statOrNull = function( path ){

	let ret = null;
	try{ ret = fs.lstatSync( path ) }
	catch( e ){}
	finally{ return ret }

}

var _getAbsolutePath = function( path ){

	let ret = null;
	let stat = null
	// Check if its absolute yet
	if( path.indexOf('/') === 0 ){
		// If it does not exist
		ret = path
		stat = _statOrNull( ret );

	}else{

		ret = upath.joinSafe(process.cwd(), path)
		stat = _statOrNull( ret );

	}
	if( stat === null ){
		
		ret = null;

	}

	return ret;

}

var _getDirFromPathOrNull = function( path ){

	let ret = _getAbsolutePath( path );
	if( ret !== null ){

		let stat = _statOrNull( ret );

		if( stat.isFile() ){
			// Trim file
			ret = ret.split('/');
			ret.pop();
			ret = ret.join('/');

		}

	}

	return ret;

}

var _getFileFromPathOrNull = function( path ){

	let ret = _getAbsolutePath( path );
	if( ret !== null ){

		let stat = _statOrNull( ret );

		if( !stat.isFile() ){

			ret = null;

		}

	}

	return ret;

}

var _getInDescriptorFromPathOrNull = function( path ){

	let ret = _getAbsolutePath( path );
	if( ret !== null ){

		let stat = _statOrNull( ret );
		// Input shall be a file or a directory
		if( !stat.isFile() && !stat.isDirectory() ){

			ret = null;

		}

	}

	return ret;

}

var _getOutDescriptorFromPathOrNull = function( path ){

	let ret = null;
	let tmp = null;
	if( !(ret = _getDirFromPathOrNull(path)) ){
		// We are given a file
		tmp = path.split('/');
		ret = tmp.pop();
		if( !(path = _getDirFromPathOrNull(tmp.join('/'))) ){
			// Bad directory path
			ret = null;
		}else{
			ret = upath.joinSafe( path, ret );
		}
	}
	return ret;

}

var prepareProgram = function(){

	// Parse command line
	program
	  .version('0.0.2')
		.option('-e, -E, --encrypt', 'Encrypt the file/directory', /^(e)$/i)
	  .option('-d, -D, --decrypt', 'Decrypt the file/directory', /^(d)$/i)
	 	.option('-c, -C, --clean', 'Whether to delete the original file/directory or not (defaults to false)', /^(c)$/i)
	  .option('-f, --file [path]', 'File/directory to encrypt/decrypt', _getInDescriptorFromPathOrNull)
	  .option('-o, --out [path]', 'Destination file', _getOutDescriptorFromPathOrNull)
	  .parse(process.argv);

	// We cannot continue if:
	//  - there is no input file OR
	//  - we are given encrypt AND decrypt options(no possible choice) OR
	//  - we are given no encrypt nor decrypt options(no possible choice)
	if(
		!process.argv.slice(2).length||
		(program.hasOwnProperty('file') && typeof program.file !== 'string' )
	){
		console.log('\n\nInvalid File!');
		program.help();
		process.exit(1);
	}else if(
		(program.E && program.D)||
		(!program.E && !program.D)
	){
		console.log('\n\nInvalid Options!\n\n');
		program.help();
		process.exit(1);
	}

	opt  = program.D?'d':'e';
	clean = program.C || clean;
	outDir = program.out;
	fd = {
		stat: _statOrNull( program.file ),
		path: program.file
	}

	if( !program.out ){

			outDir = fd.path;

	}

	console.log('Parsed:', '\n\tInput path ->', fd.path, '\n\tOutput path ->', outDir, '\n\tOption ->', opt, '\n\tClean ->', clean);

}

var _getRandName = function(){
	
	return parseInt(Date.now() * (Math.random() * 10), 10);

}

var _compressDir = function( path, callback ){

	// Prepare tmpDir for compression
	let tmpDir  = upath.joinSafe( os.tmpDir(), _getRandName() + '.zip' );
	let zip = new AdmZip();

	console.log('Compressing...');
	zip.addLocalFolder( path, tmpDir );
	// Used later on decryption
	zip.writeZip( tmpDir );
	zip.addZipEntryComment('FEEntry', 'Zipped with file-encryptor v.0.0.2');
	zip.writeZip( tmpDir );
	console.log('Done');

	callback( null, tmpDir );

}

var _fixFSTree = function( path, callback ){

	console.log('Fixing tree...', path);
	
	let stat = _statOrNull( path )
	
	if( stat && !stat.isDirectory() ){

		return callback();

	}

	async.waterfall([

		( callback ) => {

			fs.readdir( path, callback )

		},
		( list, callback ) => {

			// In some cases Adm-zip extracts a file creating a dir with the same name first, fix that
			// If file and dir are called the same, and the file is not a dir, is adm-zip error
			let dirName = path.split('/');
			dirName = dirName.filter( d =>{ return d !== '' } );
			dirName = dirName.pop();

			async.each( list, ( file, cb ) => {

				let fStat = _statOrNull( upath.joinSafe( path, file ) );

				if( !fStat ){

					return cb( 'BAD_STAT' );

				}
				
				if( file === dirName && fStat.isFile() ){

					// Rename to avoid collision
					let fixedName = String(_getRandName());
					async.waterfall([

						( cb ) => {
							
							console.log('Move:', upath.joinSafe(path, file), '->', upath.joinSafe(os.tmpDir(), fixedName));
							fs.move( upath.joinSafe(path, file), upath.joinSafe(os.tmpDir(), fixedName), cb );

						},
						( cb ) => {

							console.log('Remove:', path);
							fs.remove( path, cb );

						},
						( cb ) => {

							console.log('Move:', upath.joinSafe(os.tmpDir(), fixedName), '->', path);
							fs.move( upath.joinSafe(os.tmpDir(), fixedName), path, cb );

						}

					], cb )

				}else{

					_fixFSTree( upath.joinSafe( path, file ), cb )

				}

			}, callback )

		}

	], callback )

}

var _decompressDir = function( path, callback ){

	let dstPath = upath.trimExt( path );
	console.log('Zipped', 'Working on', path, 'dstPath', dstPath);
	try{
		
		let zip = new AdmZip( path );
		// This came from a compressed dir
		//let entries = zip.getEntries();
		// By looking at a minimum of 3 entries, we can extract the common path		
		zip.getEntries().forEach(function(entry) {
	    
	    let entryName = entry.entryName;
	    let tmp = entryName.split('/');
	    // Filter unnecessary results
	    tmp = tmp.filter( t => { return t !== '' } );
	    tmp.splice( 0, 2 );
	    let dst = upath.joinSafe( dstPath, tmp.join('/') );
	    console.log( 'Extract:', entryName, '->', dst ); // outputs the decompressed content of the entry
	    // This lib fails on some dir extraction, but does really do the extraction, no fail on chmod errors
	    try{ zip.extractEntryTo( entry, dst, false, true ); }
	    catch(e){ console.log('Failed on entry', entryName) }


		});

		callback( null, dstPath );
	
	}catch(e){
	
		console.log('No Good Zip', e)
		callback( null );

	}

}

var _processFile = function( processCb, inputFile, outputFile, password, options, callback ){

	console.log('Working...',
		'\n\tInput file ->', inputFile,
		'\n\tOutput file ->', outputFile,
		'\n\tPassword ->', password,
		'\n\tOptions ->', options
	);
	processCb( inputFile, outputFile, password, options, function( err ){

  	if( err ){

  		console.log('There was an error', err);
  		callback( err );

  	}else{

  		console.log('Done');
  		// Chainability
  		callback( null, inputFile );

  	}

	});

}

var _encryptFile = function( inputPath, outputPath, password, callback ){

	_processFile( encryptor.encryptFile, inputPath, outputPath, password, options, callback );

}

var _decryptFile = function( inputPath, outputPath, password, callback ){

	_processFile( encryptor.decryptFile, inputPath, outputPath, password, options, callback );

}

prepareProgram();

async.waterfall([

	// Aquire password
	function( callback ){

		prompt.start();
		prompt.get([{
		
			name: 'password',
			hidden: true,
		    replace: '*',
		    required: true 

		}], ( err, result ) => {

			if( err ){
				
				callback( err );
			
			}else{

				key = result.password;
				callback( null );
			
			}

		})

	},
	// Compress or pass
	function( callback ){

		// If we are encrypting a directory we need a zip a file
		if( opt === 'e' && fd.stat.isDirectory() ){

			_compressDir( fd.path, callback );

		}else{

			callback( null, fd.path );

		}

	},
	// Process
	function( dir, callback ){

		if( opt === 'e' ){

			outDir = upath.addExt( outDir, 'enc' );
			_encryptFile( dir, outDir, key, callback );

		}else{

			// Try to guess extension from file, if we are not able,
			// as we always zip folders on ecryption, let it be a zip

			// we had a **.enc file
			if( outDir.indexOf('.enc') === (outDir.length -4) ){
			
				outDir = upath.trimExt( outDir );

			}
			// If we trim again and the path dimishes, then we had another extension, otherwise add ours
			if( outDir === upath.trimExt( outDir ) ){

				outDir = upath.addExt( outDir, 'zip' );

			}// else We had another extension, good to go

			_decryptFile( dir, outDir, key, callback );

		}

	},
	// Decompress or pass
	function( origFile, callback ){

		if( opt === 'd' ){

			_decompressDir( outDir, function( err, dstPath ){

				if( err ){

					return callback( err );

				}

				if( dstPath ){

					_fixFSTree( dstPath, function( err ){

						if( err ){

							return callback( err );

						}

						cleanFiles.push( outDir );

						callback( null, origFile );

					})

				}else{

					callback( null, origFile );

				}

			})

		}else{

			callback( null, origFile );

		}

	},
	// Setup clean files
	function( origFile, callback ){

		// If we were encrypting and it was a directory,
		// we created a tmp zip file, origFile points there, always delete it
		// otherwise origFile points to the real file, erase if asked on next step
		if( opt === 'e' && fd.stat.isDirectory() && origFile ){
			// Is always a file, no need to worry about unliking a dir
			cleanFiles.push( origFile );

		}
	
		if( clean ){

			cleanFiles.push( fd.path );

		}

		callback( null )

	},
	function( callback ){
		
		console.log('Cleaning...');
		async.each( cleanFiles, fs.remove, callback );

	}

	// End
], function( err ){

	if( err ){
	
		console.log('Errored', err);

	}else{

		console.log('Done!! Good to go');

	}

})