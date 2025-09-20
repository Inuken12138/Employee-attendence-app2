// README.md

# Get started

# Activate virtual environment

source .songfeiVENV/bin/activate

# Start the backend

cd d:\Employee attendence app2\django_backend
python manage.py runserver

# Start the front end

cd "d:\Employee attendence app2\nextjs_frontend\songfei"
npm run dev

# Database

We need to establish a connection between django and postgresql so the backend can talk to the database

postgresql user name: postgres (No password, for dev purpose)

Command for setting up the database

### CREATE DATABASE songfei_db;

### CREATE USER songfei_user WITH PASSWORD '1234';

### GRANT ALL PRIVILEGES ON DATABASE songfei_db TO songfei_user;

Database Name: songfei_db
Database User: songfei_user
User Password: 1234
Host: localhost
Port: 5432
PostgreSQL Version: 15.7

# VENV

We are using the "songVenv" virtual environment to install python dependencies

# superuser

### User name = renhua

### password = laowewanxiang

# helpful resources

## https://www.youtube.com/watch?v=iFEVef5XdMI&ab_channel=CodingEntrepreneurs

## https://dev.to/koladev/building-a-fullstack-application-with-django-django-rest-nextjs-3e26

# Key dependenties

Python 3.11.3
PostgreSQL 15.7
Node.js v22.14.0
