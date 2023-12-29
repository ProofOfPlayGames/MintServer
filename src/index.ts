import dotenv from 'dotenv';
import {Keypair, Transaction, Connection, PublicKey} from '@solana/web3.js';
import * as bs58 from 'bs58';
import {getAssociatedTokenAddress, getAccount, createMintToInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { Client } from 'pg';
import * as fs from 'fs';
import * as https from "https";
import * as crypto from "crypto";
import schedule from 'node-schedule';

dotenv.config();

const connection = new Connection(process.env.SOL_NETWORK || "", 'confirmed');
const walletKeyPair = Keypair.fromSecretKey(
    bs58.decode(process.env.WALLET_SPK as string)
);

//const privkey = new Uint8Array([123...]); // content of id.json here
//console.log(bs58.encode(privkey));
 
const client = new Client(
        {host: process.env.PG_HOST,
        port: 5432,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        ssl: false}
);
client.connect();

var tx = new Map<number, Transaction>();
var txNumb = 0;
var countThem = 0;

// Token program ID (for Solana Devnet)
const tokenProgramId = TOKEN_PROGRAM_ID; 
const mintAddr = new PublicKey(process.env.MINT_TOKEN_ADDR || "");

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
  process.env.SPL_ATAP_ID || "",
);

// Mint new token
async function mintTokens(walletAddr: string, amount: number, trans: number) {
  try {
const walletAddr_pubKeyObj = new PublicKey(walletAddr);
  
  let ata = await getAssociatedTokenAddress(
      mintAddr, // mint
      walletAddr_pubKeyObj, // owner
      false // allow owner off curve
    ); 
  
let checkAccountExists = false;
//console.log(walletAddr_pubKeyObj);
try{
await getAccount(connection, ata).then((obj) => {
  //console.log(obj);
  checkAccountExists = obj.isInitialized;
});
//console.log(checkAccountExists);
}catch (error) {
    console.log('Creating new ATA account: ' + ata);
  }
if(!checkAccountExists && tx.has(trans)){
  tx.get(trans)?.add(
    createAssociatedTokenAccountInstruction(
      walletKeyPair.publicKey,
      ata,
      walletAddr_pubKeyObj,
      mintAddr
    )
  );
console.log(trans + " -a-");
}
console.log(trans + " -b-");
tx.get(trans)?.add(
    createMintToInstruction(
      mintAddr,
      ata,
      walletKeyPair.publicKey, // mint auth
      amount, // amount
      9 // decimals
    )
  );
  console.log(String(amount/1000000000) + ": " + ata);
  //return new Promise(resolve => async function(){
//resolve("hello1");
//});
  } catch (error) {
    console.error('Error minting token:', error);
    throw error;
  }
}


function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}


async function mintAllTheTokens(){
  try {
    const gamesDbTables = ["speed_square"];
    gamesDbTables.forEach(async function (gameTable) {
    tx = new Map<number, Transaction>();
    tx.set(0, new Transaction());
    countThem = 0;
    txNumb = 0;
    let popPoints = new Map<string, number>();
    let sql = "SELECT pub_key, high_score, today_high_score, today_score, today_games FROM users INNER JOIN " + gameTable + " ON users.username = " + gameTable + ".username WHERE pub_key!='' ORDER BY " + gameTable + ".today_high_score ASC;";
    const res2 = await client.query(sql);
     console.log(res2.rows);
    let sum = 0;
    let numTops = [];
    res2.rows.forEach(function (row) {
	if (numTops.length < 4) {
	    numTops.push(row.pub_key);
	}
	console.log(numTops);
	let popPs = row.high_score * row.today_high_score * ((row.today_score/1000)+1);
	popPoints.set(row.pub_key, popPs);
	sum += popPs;
    });
    //console.log("sum: " + sum);
    console.log(numTops);
    console.log("-----------------------------------");
    await popPoints.forEach(async function (val, key) {
	//console.log("\npub_key: " + key + "\nPop Points: " + val);
	let percentOfGame = val/sum;
	let amountAdjustedForGames = percentOfGame*(Number(process.env.TOKENS_PER_DAY_TOTAL)/gamesDbTables.length);
	let amount = Math.round(amountAdjustedForGames*1000000000);
	if(amount > 0){
		countThem = countThem + 1;
		//console.log("yessyeyeyey");
		console.log(countThem);
		if(countThem == 9){
			console.log("ehhhhhhh");
			console.log(txNumb);
		    countThem = 0;
		    txNumb = txNumb + 1;
		    tx.set(txNumb, new Transaction());
		}
	    let w = mintTokens(key, amount, txNumb);
	    //console.log(w);
	    //w.then((stuff) => {
//		  txCounter = txCounter + 1;
		    //console.log(stuff);
		//console.log("444444");
	   // });
        }
    });
//console.log(popPoints);
console.log("ppppppppp");
//console.log(gameTable);

await delay(10000);
console.log(tx);
tx.forEach(async (val, key) => {
    console.log(key);
    await delay(key*60000);
   tryToMint(val, key);
});

const gt = String(gameTable);
let sql3 = "UPDATE " + gt + " SET today_score=0, today_high_score=0, today_games=0 WHERE true;";
//console.log(sql3);    
const res3 = await client.query(sql3);

//tryToMint(gt, countThem);
    });
  } catch (error) {
  console.log(error);
  throw error;
  }
}


async function tryToMint(val: Transaction, key: number){
     try{
    console.log(`txhash: ${await connection.sendTransaction(val, [walletKeyPair, walletKeyPair])}`);
 } catch (error) {
  console.log("error minting transaction " + String(key));
  console.log("error: " + error);
  await delay(75000);
  tryToMint(val, key);
  }
}

schedule.scheduleJob('0 0 0 * * *', () => {
	mintAllTheTokens();
	console.log(new Date());
}); // run everyday at midnight

