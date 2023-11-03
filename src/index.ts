import dotenv from 'dotenv';
import {Keypair, Transaction, Connection, PublicKey} from '@solana/web3.js';
import * as bs58 from 'bs58';
import {getAssociatedTokenAddress, getAccount, createMintToCheckedInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID} from "@solana/spl-token";
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

// Token program ID (for Solana Devnet)
const tokenProgramId = TOKEN_PROGRAM_ID; 
const mintAddr = new PublicKey(process.env.MINT_TOKEN_ADDR || "");

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
  process.env.SPL_ATAP_ID || "",
);

// Mint new token
async function mintTokens(walletAddr: string, amount: number) {
  try {
  const walletAddr_pubKeyObj = new PublicKey(walletAddr);
  
  let ata = await getAssociatedTokenAddress(
      mintAddr, // mint
      walletAddr_pubKeyObj, // owner
      false // allow owner off curve
    ); 
  
  let tx = new Transaction();
let checkAccountExists = false;
console.log(walletAddr_pubKeyObj);
try{
await getAccount(connection, ata).then((obj) => {
  console.log(obj);
  checkAccountExists = obj.isInitialized;
});
console.log(checkAccountExists);
}catch (error) {
    console.log('ATA does not exist. Creating account');
  }
if(!checkAccountExists){
  tx.add(
    createAssociatedTokenAccountInstruction(
      walletKeyPair.publicKey,
      ata,
      walletAddr_pubKeyObj,
      mintAddr
    )
  );
}

tx.add(
    createMintToCheckedInstruction(
      mintAddr,
      ata,
      walletKeyPair.publicKey, // mint auth
      amount, // amount
      9 // decimals
    )
  );
  console.log(`txhash: ${await connection.sendTransaction(tx, [walletKeyPair, walletKeyPair])}`);

  } catch (error) {
    console.error('Error minting token:', error);
    throw error;
  }
}




async function mintAllTheTokens(){
  try {
    const gamesDbTables = ["speed_square"];
    gamesDbTables.forEach(async function (gameTable) {
    let popPoints = new Map<string, number>();
    let sql = "SELECT pub_key, high_score, today_high_score, today_score, today_games FROM users INNER JOIN " + gameTable + " ON users.username = " + gameTable + ".username WHERE pub_key!='';";
    const res2 = await client.query(sql);
    let sum = 0;
    res2.rows.forEach(function (row) {
	let popPs = row.high_score * row.today_high_score * row.today_score;
	popPoints.set(row.pub_key, popPs);
	sum += popPs;
    });
    console.log("sum: " + sum);
    popPoints.forEach(async function (val, key) {
	console.log("\npub_key: " + key + "\nPop Points: " + val);
	let percentOfGame = val/sum;
	let amountAdjustedForGames = percentOfGame*(Number(process.env.TOKENS_PER_DAY_TOTAL)/gamesDbTables.length);
	let amount = Math.round(amountAdjustedForGames*1000000000);
	if(amount > 0){
	    await mintTokens(key, amount);
        }
    });
console.log(popPoints);
let sql3 = "UPDATE " + gameTable + " SET today_score=0, today_high_score=0, today_games=0 WHERE true;";
    const res3 = await client.query(sql3);
    });
  } catch (error) {
  console.log(error);
  }
}


schedule.scheduleJob('* * * * *', () => {
	mintAllTheTokens();
}); // run everyday at midnight

