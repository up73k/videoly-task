# videoly-task
test postgresql task

*REQUERIMENTS:*
Node 6/8, npm 3/5 or yarn

*POPULATE DB*

This part of task maked with using `COPY table FROM STDIN` command and streams, without temporary saving on disk.

1. Install dependencies:
`$ yarn install` 
or
`$ npm install`

2. Edit config.json if needed (for your postgres connection):
Default is :
  ```
  "postgres": {
    "host": "localhost",
    "user": "postgres",
    "password": "",
    "port": 5432,
    "database": "videoly-task"
  }
  ```
  
3. Run populate-script:
`$ yarn populate` 
or
`$ npm run populate`

4. Wait 2-5 min

P.S. If you'll have troubles, fell free to tell me about it.

*SQL*

SQL queries for test consistence of generated with comments are saved in `\sql.txt`
