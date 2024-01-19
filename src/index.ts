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



const gamesDbTables = ["speed_square"];
let averagesForGames: number[] = [];
let gameWeights = new Map<String, number>();
let popPoints = new Map<string, number>();
let maxes = new Map<string, number>();



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
//console.log(trans + " -a-");
}
//console.log(trans + " -b-");
tx.get(trans)?.add(
    createMintToInstruction(
      mintAddr,
      ata,
      walletKeyPair.publicKey, // mint auth
      amount // amount
      //9 // decimals
    )
  );
//  console.log(String(amount/1000000000) + ": " + ata);
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
    averagesForGames = [];
    gameWeights = new Map<String, number>(); 

    gamesDbTables.forEach(async function (gameTable) {
	let sql4 = "SELECT high_score FROM " + gameTable + "  ORDER BY high_score DESC LIMIT 100;";
    	const res4 = await client.query(sql4);
	let sum2 = 0;
	res4.rows.forEach(function (row) {
	    sum2 += row.high_score;
	});
	averagesForGames.push(sum2/res4.rows.length);
    });

    let i = 0;
    await averagesForGames.forEach(function (average) {
	gameWeights.set(gamesDbTables[i], averagesForGames[0]/average);
	i++;
    });

    popPoints = new Map<string, number>();
    maxes = new Map<string, number>();
    let counter = 3;

    await gamesDbTables.forEach(async function (gameTable) {
	console.log("ahhhhhhhh1");
    	let sql = "SELECT pub_key, high_score, today_high_score, today_score, today_games, controllers FROM users INNER JOIN " + gameTable + " ON users.username = " + gameTable + ".username WHERE pub_key!='' AND controllers>0 ORDER BY " + gameTable + ".today_high_score DESC;";
    	const res2 = await client.query(sql);
	console.log("ahhhhhhhh2");
     	console.log(res2.rows);
    	res2.rows.forEach(function (row) {
	    let extra = 0;
	    if (counter > 0) {
	    	counter--;
		extra = 1000000*(1+counter*2); 
	    }
	    maxes.set(row.pub_key, getMax(row.controllers));
	    let popPs = row.high_score * row.today_high_score * (1+(row.today_score/100));
	    popPoints.set(row.pub_key, (popPoints.get(row.pub_key) ?? 0) + popPs + extra);
	    console.log("ahhhhhhhh3");
	    console.log(popPoints);
    	});
    });

  } catch (error) {
  console.log(error);
  throw error;
  }
return new Promise((resolve, reject) => { 
        setTimeout(resolve, 100, true);
    });
}


async function minting2(){
  try{
    console.log("poppoints");
    console.log(popPoints);
    tx = new Map<number, Transaction>();
    tx.set(0, new Transaction());
    countThem = 0;
    txNumb = 0;

    await popPoints.forEach(async function (val, key) {
        console.log("key: " + key);
        let realAmount = val;
        if (maxes.get(key) != undefined && val > (maxes.get(key))){
            realAmount = maxes.get(key) ?? 0;
        }
        let amount = Math.round(realAmount*1000000000);
        if(amount > 0){
                countThem = countThem + 1;
                console.log(countThem);
                if(countThem == 9){
                        console.log("ehhhhhhh");
                        console.log(txNumb);
                    countThem = 0;
                    txNumb = txNumb + 1;
                    tx.set(txNumb, new Transaction());
                }
            let w = mintTokens(key, amount, txNumb);
        }
    });

    await delay(10000);
    console.log(tx);
    tx.forEach(async (val, key) => {
        console.log(key);
        await delay(key*60000);
        tryToMint(val, key);
    });

    let sql3 = "";
    gamesDbTables.forEach(async function (gameTable) {
        const gt = String(gameTable);
        sql3 = sql3 + "UPDATE " + gt + " SET today_score=0, today_high_score=0, today_games=0 WHERE true;\n";
    });
    const res3 = await client.query(sql3);
  
  } catch (error) {
  console.log(error);
  throw error;
  }
return new Promise((resolve, reject) => {
        //setTimeout(resolve, 100, true);
    });
}


function getMax(controllers: number){
    const million = 1000000;
    if(controllers < 3) {
	return controllers*million;
    }
    if(controllers >= 3 && controllers < 6) {
        return 4*million;
    }
    if(controllers >= 6 && controllers < 9) {
        return 9*million;
    }
    return 15*million;
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


//schedule.scheduleJob('0 0 0 * * *', () => {
    (async () => {
        await mintAllTheTokens(); // true
	await minting2();	   
    })();
////	console.log(new Date());
//}); // run everyday at midnight

