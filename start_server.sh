#!/bin/bash

cd /var/lib/mock-echo

node index.js $SERVER_PORT >> /var/logs/mock-echo/server.log
