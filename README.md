# Get started

# Activate virtual environment

    source .songfeiVENV/bin/activate

# Start Postgres once per WSL session
    sudo service postgresql start

# Start the backend

    cd ~/project/songfei/Employee attendence app2\django_backend
    
    # if running on windows natively:
    python manage.py runserver

    # if running on WSL:
    python manage.py runserver 0.0.0.0:8000

    # Access from your browser at: http://localhost:8000/ 
    # Admin site will be at http://localhost:8000/admin

# Start the front end

    cd ~/project/songfei/Employee\ attendence\ app2/nextjs_frontend/songfei
    npm run dev




# Initial setup
## VENV
We are using the ".songfeiVENV" virtual environment to install python dependencies

    python3 -m venv .songfeiVENV
    source .songfeiVENV/bin/activate
    pip install -r requirements.txt

## Database
If you don't have postgresql yet:

    sudo apt install curl ca-certificates 
    sudo install -d /usr/share/postgresql-common/pgdg 
    sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc . /etc/os-release 
    sudo sh -c "echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main' > /etc/apt/sources.list.d/pgdg.list" 
    
    sudo apt update 
    sudo apt install postgresql-15

We need to establish a connection between django and postgresql so the backend can talk to the database

postgresql user name: postgres (No password, for dev purpose)

Command for setting up the database

    CREATE ROLE songfei_user WITH LOGIN PASSWORD '8129';
    CREATE DATABASE songfei_db OWNER songfei_user;
    GRANT ALL PRIVILEGES ON DATABASE songfei_db TO songfei_user;
    \q # to exit

To verify set up, from your shell (not inside psql):

    psql -h 127.0.0.1 -U songfei_user -d songfei_db

Run migrations to check:

    python3 manage.py migrate


## superuser

    python manage.py createsuperuser

Use the following information:
1. User name = renhua
2. email = luorenhua.com@gmail.com
3. password = laowewanxiang

# helpful resources

## https://www.youtube.com/watch?v=iFEVef5XdMI&ab_channel=CodingEntrepreneurs
## https://dev.to/koladev/building-a-fullstack-application-with-django-django-rest-nextjs-3e26

# Key dependenties

Python 3.11.3 (Python 3.12.3 in this new install)
PostgreSQL 15.7 (15.14 in the new install)
Node.js v22.14.0 

# Key information

## Database
Database Name: songfei_db

Database User: songfei_user

User Password: 8129

Host: localhost

Port: 5432

PostgreSQL Version: 15.7 (15.14 in the new install)

## Django superuser

User name = renhua

email = luorenhua.com@gmail.com

password = laowewanxiang

# How to gracefully stop all services
1. Ctrl + C in the next.js terminal
2. Ctrl + C in the django terminal
3. In the same django terminal, type `deactivate`
4. Stop PostgreSQL, `sudo service postgresql stop` and type in the password

