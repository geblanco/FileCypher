#!/usr/bin/env bash

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi
if [ node ]; then
	echo "= installing..."
	npm install
	chmod 775 cypher.js
	echo ""
	echo "= done"
	echo ""
	echo "run the program with ./cypher.js"
else
	echo "= nodejs not installed, please install it and come back!"
	echo " you can download it here https://nodejs.org/en/download/"
fi