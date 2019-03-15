
const path = require('path');
const fs = require('fs-extra');
const request = require('request');
const unzipper = require('unzipper');
const RouteParser = require('route-parser');

const inputFunc = async function({universe, SELF, INPUT}){

  console.log('--App: --', SELF.name);
  
  let {
    req,
    res 
  } = universe.requestsCache[universe.requestId];
  
  let appPath = SELF.name; //universe.navPathv1(SELF.name, 1)
  let appNode = SELF; //await universe.getNodeAtPath(appPath); // SELF
  
  // return res.send('ok109090910');
  
  // Capture /api and other routes 
  // Fallback to static file sending 
  
      
  let usedPath = req.url.split('/').slice(0,3).join('/');
  let appLookupPath = req.url.substring(usedPath.length);
  
  // handle incoming request for an app (view, api)  
  // - expecting express_obj 
  // - also handling authentication here (allow anonymous, etc.) for paths 
  
  
  // console.log('http_request sample_pwa INPUT:', INPUT.type, INPUT.data);
  // INPUT = express_obj
  
  let htmlNode, page;
  
  // Load static files from appPath
  // - no auth required 
  // - simple redirect? 
  if(!universe.env.ATTACHED_VOLUME_ROOT){
    console.error('Missing ATTACHED_VOLUME_ROOT');
    return res.status(404).send('Missing File');
  }
  let staticFileDirectory = appNode.data.opts.frontendStaticFileDirectory || '';
  let volumePrefix = path.join(universe.env.ATTACHED_VOLUME_ROOT, appPath);
  let staticRootPath = path.join(volumePrefix, staticFileDirectory);
  let volumeLookupPath = path.join(staticRootPath, appLookupPath);
  let finalVolumeLookupPath = path.resolve(volumeLookupPath);
  if(finalVolumeLookupPath.indexOf(volumePrefix + '/') !== 0){
    console.error('Invalid PATH lookup!', finalVolumeLookupPath);
    return res.status(404).send('Missing File');
  }
  let exists = fs.existsSync(finalVolumeLookupPath);
  if(exists){
    console.log('finalVolumeLookupPath:',finalVolumeLookupPath);
    res.sendFile(finalVolumeLookupPath);
    return true;
  }
  
  // get url relative to myself 
  // let appPath = universe.navPathv1(SELF.name, 1)
  console.log('appLookupPath:', finalVolumeLookupPath, appLookupPath, req.originalUrl, appPath);

  res.send('Missing, 404d');
  return;
  
  let routesWithAuth = [
    {
      routes: '/install',
      directToCode: 'install',
      anonymous: false,
      loggedin: true
    },
    {
      routes: '/edit',
      directToCode: 'edit',
      anonymous: false,
      loggedin: true
    },
    {
      routes: '/build',
      directToCode: 'build',
      anonymous: false,
      loggedin: true
    },
    {
      routes: '/sandbox',
      directToCode: 'sandbox',
      anonymous: false,
      loggedin: true
    },
    {
      routes: '/update',
      directToCode: 'update',
      anonymous: false,
      loggedin: true
    },
    
    {
      routes: [
        '/api/*apirouteinfo',
      ],
      anonymous: true,
      loggedin: true
    },
    {
      routes: 'all',
      anonymous: true,
      loggedin: true
    }
  ]
  
  let allow = false;
  let routed = false;
  let returnedAlready = true;
  for(let routeAuth of routesWithAuth){
    if(routed){continue}
    let routes = universe.lodash.isArray(routeAuth.routes) ? routeAuth.routes:[routeAuth.routes];
    for(let tmpMatchRoute of routes){
      if(routed){continue}
      if(typeof tmpMatchRoute != 'string'){continue}
      // TODO: test for invalid "/*" type of routes (MUST HAVE THE VAR NAME AFTER "*" LIKE "/*all") 
      // - somehow "/*" is ok but "/static/*" isnt, which is frustrating 
      let tmpRoute = new RouteParser(tmpMatchRoute);
      let match = tmpRoute.match(appLookupPath)
      if(match || routes == 'all'){
        routed = true;
        console.log('http_request (inside) App Route Match:', appLookupPath, tmpMatchRoute);
        
        // check authentication
        // - as part of routeAuth (TODO: better auth/versioning/groups/etc) 
      
        // require loggedin? 
        // - all apps are internal-only? 
        // - TODO: per-app basis? 
        if(req.session.loggedin){
          if(routeAuth.loggedin !== true){
            // loggedin people NOT allowed (kinda wierd, TODO: use groups/etc to determine loggedin/user) 
            res.redirect(`/auth/relogin?redirect=${encodeURIComponent(req.originalUrl)}`);
            return true;
          }
        } else {
          // not logged in, anonymous must be allowed 
          if(routeAuth.anonymous !== true){
            // loggedin people NOT allowed (kinda wierd, TODO: use groups/etc to determine loggedin/user) 
            console.info('Not Logged in, Not allowing anonymous (redirecting)');
            res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
            return true;
          }
        }
        
        allow = true;
        
        if(routeAuth.directToCode){
          returnedAlready = false;
          // if(routeAuth.directReturnImmediate){
          //   res.send('Running Command: ' + routeAuth.directToCode);
          // }
          let codeResult;
          try {
            console.log('Running direct:', routeAuth.directToCode);
            let directCodeNode = await universe.getNodeAtPath( universe.navPathv1(SELF.name, 1, routeAuth.directToCode) );
            if(!directCodeNode){
              console.error('Missing direct code node for path match obj:', routeAuth, SELF.name);
              return;
            }
            codeResult = await universe.execCodeNode({
              codeNode: directCodeNode,
              dataNode: INPUT, // passes incoming express obj, with req, res 
            });
            console.log('Output from routeAuth.directToCode:', codeResult);
            return; 
          }catch(err){
            universe.scriptError(err, SELF);
            return false;
          }
          
        }
        
      }
    }
  }
  if(returnedAlready){
    return true;
  }
  if(!allow){
    console.log('404 for a user:', appLookupPath);
    return res.status(404).send(404);
  }
  
  // direct paths to relative code node 
  
  if(appLookupPath == '/clear'){
    console.error('----CLEARING----', volumePrefix);
    fs.emptyDirSync(volumePrefix)
    return res.send('Clearing app, please wait: ' + volumePrefix);
  }
  
  // TODO: possible /api endpoints 
  
  // TODO: 404 if was looking for a file? http status code for "client-side routing?" 
  // - instead of returning the index each time?
  // - how do we *know* it was a file request? 
  
  console.error('Returning default index.html');
  let defaultIndexFullPath = staticRootPath + '/index.html';
  let indexExists = fs.existsSync(defaultIndexFullPath);
  if(indexExists){
    console.log('Returning index.html for path:', req.originalUrl);
    res.send('index');
    // res.sendFile(defaultIndexFullPath);
  } else {
    console.error('App not installed:', defaultIndexFullPath);
    res.status(404).send('App not installed');
  }
  
  return true;
  

 }


module.exports = inputFunc;


// // INCLUDED:
// // - INPUT
// // - SELF (codenode) 

// const cheerio = require('cheerio');

// module.exports = async function(){

// 	console.log('====In Here=====');

//   let {
//     req,
//     res 
//   } = universe.requestsCache[universe.requestId];
  
//   res.send({test: 'fucking awesome5', type: INPUT.type});

//   return true;

// }


// (()=>{
//   return new Promise(async (resolve, reject)=>{
//     try {
      
//       let {
//         req,
//         res 
//       } = universe.requestsCache[universe.requestId];
      
//       res.send({test: 'fucking awesome'});

//       return resolve(true);

//     }catch(err){
//     	universe.scriptError(err, SELF);
//     }

//   })
// })()