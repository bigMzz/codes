const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const request = require('sync-request');
const express = require('express');
const router = express.Router();
const Web3 = require('web3');
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');


let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

/* GET home page. */
router.get('/', function(req, res, next) {

  let search = req.query.search;
  let traits = req.query.traits;
  let useTraitNormalization = req.query.trait_normalization;
  let orderBy = req.query.order_by;
  let page = req.query.page;

  let offset = 0;
  let limit = config.page_item_num;

  if (_.isEmpty(search)) {
    search = '';
  }

  if (_.isEmpty(traits)) {
    traits = '';
  }

  let scoreTable = 'punk_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  if (orderBy == 'rarity' || orderBy == 'id') {
    orderBy = orderBy;
  } else {
    orderBy = 'rarity';
  }

  if (!_.isEmpty(page)) {
    page = parseInt(page);
    if (!isNaN(page)) {
      offset = (Math.abs(page) - 1) * limit;
    } else {
      page = 1;
    }
  } else {
    page = 1;
  }

  let selectedTraits = (traits != '') ? traits.split(',') : [];
  let totalPunkCount = 0
  let punks = null;
  let orderByStmt = '';
  if (orderBy == 'rarity') {
    orderByStmt = 'ORDER BY '+scoreTable+'.rarity_rank ASC';
  } else {
    orderByStmt = 'ORDER BY punks.id ASC';
  }

  let totalSupply = db.prepare('SELECT COUNT(punks.id) as punk_total FROM punks').get().punk_total;
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  let allTraitTypesData = {};
  allTraitTypes.forEach(traitType => {
    allTraitTypesData[traitType.trait_type] = traitType.punk_count;
  });

  let allTraits = db.prepare('SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.punk_count, trait_detail_types.trait_type_id, trait_detail_types.id trait_detail_type_id  FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.punk_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type').all();
  let totalPunkCountQuery = 'SELECT COUNT(punks.id) as punk_total FROM punks INNER JOIN '+scoreTable+' ON (punks.id = '+scoreTable+'.punk_id) ';
  let punksQuery = 'SELECT punks.*, '+scoreTable+'.rarity_rank FROM punks INNER JOIN '+scoreTable+' ON (punks.id = '+scoreTable+'.punk_id) ';
  let totalPunkCountQueryValue = {};
  let punksQueryValue = {};

  if (!_.isEmpty(search)) {
    search = parseInt(search);
    totalPunkCountQuery = totalPunkCountQuery+' WHERE punks.id LIKE :punk_id ';
    totalPunkCountQueryValue['punk_id'] = '%' + search  + '%';
    
    punksQuery = punksQuery+' WHERE punks.id LIKE :punk_id ';
    punksQueryValue['punk_id'] = '%' + search  + '%';
  } else {
    totalPunkCount = totalPunkCount;
  }

  let allTraitTypeIds = [];
  allTraits.forEach(trait => {
    if (!allTraitTypeIds.includes(trait.trait_type_id.toString())) {
      allTraitTypeIds.push(trait.trait_type_id.toString());
    }
  }); 

  let purifySelectedTraits = [];
  if (selectedTraits.length > 0) {

    selectedTraits.map(selectedTrait => {
      selectedTrait = selectedTrait.split('_');
      if ( allTraitTypeIds.includes(selectedTrait[0]) ) {
        purifySelectedTraits.push(selectedTrait[0]+'_'+selectedTrait[1]);
      }
    });

    if (purifySelectedTraits.length > 0) {
      if (!_.isEmpty(search.toString())) {
        totalPunkCountQuery = totalPunkCountQuery + ' AND ';
        punksQuery = punksQuery + ' AND ';
      } else {
        totalPunkCountQuery = totalPunkCountQuery + ' WHERE ';
        punksQuery = punksQuery + ' WHERE ';
      }
      let count = 0;

      purifySelectedTraits.forEach(selectedTrait => {
        selectedTrait = selectedTrait.split('_');
        totalPunkCountQuery = totalPunkCountQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        punksQuery = punksQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        if (count != (purifySelectedTraits.length-1)) {
          totalPunkCountQuery = totalPunkCountQuery + ' AND ';
          punksQuery = punksQuery + ' AND ';
        }
        count++;

        totalPunkCountQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];
        punksQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];    
      });
    }
  }
  let purifyTraits = purifySelectedTraits.join(',');

  punksQuery = punksQuery+' '+orderByStmt+' LIMIT :offset,:limit';
  punksQueryValue['offset'] = offset;
  punksQueryValue['limit'] = limit;

  totalPunkCount = db.prepare(totalPunkCountQuery).get(totalPunkCountQueryValue).punk_total;
  punks = db.prepare(punksQuery).all(punksQueryValue);

  let totalPage =  Math.ceil(totalPunkCount/limit);

  res.render('index', { 
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'rarity',
    punks: punks, 
    totalPunkCount: totalPunkCount,
    totalPage: totalPage, 
    search: search, 
    useTraitNormalization: useTraitNormalization,
    orderBy: orderBy,
    traits: purifyTraits,
    selectedTraits: purifySelectedTraits,
    allTraits: allTraits,
    page: page,
    totalSupply: totalSupply,
    allTraitTypesData: allTraitTypesData,
    _:_ 
  });
});

router.get('/matrix', function(req, res, next) {

  let allTraits = db.prepare('SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.punk_count FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.punk_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type').all();
  let allTraitCounts = db.prepare('SELECT * FROM punk_trait_counts WHERE punk_count != 0 ORDER BY trait_count').all();
  let totalPunkCount = db.prepare('SELECT COUNT(id) as punk_total FROM punks').get().punk_total;

  res.render('matrix', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'matrix',
    allTraits: allTraits,
    allTraitCounts: allTraitCounts,
    totalPunkCount: totalPunkCount,
    _:_ 
  });
});

router.get('/wallet', function(req, res, next) {
  let search = req.query.search;
  let useTraitNormalization = req.query.trait_normalization;

  if (_.isEmpty(search)) {
    search = '';
  }

  let scoreTable = 'punk_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  let isAddress = Web3.utils.isAddress(search);
  let tokenIds = [];
  tokenIds.push(1000);
  let punks = null;
  if (isAddress) {
    
      const web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org/'));
    const abi = [{"inputs":[{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"symbol","type":"string"},{"internalType":"string","name":"baseTokenURI","type":"string"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"approved","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"bool","name":"approved","type":"bool"}],"name":"ApprovalForAll","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"approve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"baseExtension","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claimRewards","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"cost","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"getApproved","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"getReflectionBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_owner","type":"address"}],"name":"getReflectionBalances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_owner","type":"address"}],"name":"getTokenIds","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"operator","type":"address"}],"name":"isApprovedForAll","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"lastDividendAt","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lastSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxMintAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_mintAmount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"mintReward","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"minters","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"ownerOf","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bool","name":"_state","type":"bool"}],"name":"pause","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"paused","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_winner","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"randomGiveaway","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"reflectToOwners","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"reflectionBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"remainingIds","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"bytes","name":"_data","type":"bytes"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"bool","name":"approved","type":"bool"}],"name":"setApprovalForAll","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"_newBaseExtension","type":"string"}],"name":"setBaseExtension","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"baseURI","type":"string"}],"name":"setBaseURI","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_newCost","type":"uint256"}],"name":"setCost","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_newmaxMintAmount","type":"uint256"}],"name":"setmaxMintAmount","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"tokenByIndex","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"}],"name":"tokenOfOwnerByIndex","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_id","type":"uint256"}],"name":"tokenURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalDividend","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"transferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}] ;
     const contractAddress = '0xA2b49b38f74046A9c5f7A92D0C5635DbF8342852';
     let contract = new web3.eth.Contract(abi, contractAddress);
    
    
    async function fun1(req, res){
let ownertokenids = contract.methods.getTokenIds(search).call().catch( error => {
      
            tokenIds.push(1001);

        });
      
       }
      
      if (ownertokenids.err)
    { 
        tokenIds.push(1002);
     
    }
    else {
         tokenIds.push(1003);
        Array.prototype.push.apply(tokenIds, ownertokenids);

    }
    
   
    
    
      
     tokenIds.push(1004);
    

   // let url = 'https://api.punkscape.xyz/address/'+search+'/punkscapes';
  //  let result = request('GET', url);
  //  let data = result.getBody('utf8');
  //  data = JSON.parse(data);
  //  data.forEach(element => {
  //    tokenIds.push(element.token_id);
 //   });
    if (tokenIds.length > 0) {
      let punksQuery = 'SELECT punks.*, '+scoreTable+'.rarity_rank FROM punks INNER JOIN '+scoreTable+' ON (punks.id = '+scoreTable+'.punk_id) WHERE punks.id IN ('+tokenIds.join(',')+') ORDER BY '+scoreTable+'.rarity_rank ASC';
      punks = db.prepare(punksQuery).all();
    }
  }
  
  res.render('wallet', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'wallet',
    punks: punks,
    search: search, 
    useTraitNormalization: useTraitNormalization,
    _:_ 
  });
});

module.exports = router;
