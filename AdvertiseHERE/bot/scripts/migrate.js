import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {db} from '../src/db.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
const sql=await readFile(fileURLToPath(new URL('../schema.sql',import.meta.url)),'utf8');
try{await db.query(sql);console.log('AdvertiseHERE tables are ready.');}finally{await db.end();}
