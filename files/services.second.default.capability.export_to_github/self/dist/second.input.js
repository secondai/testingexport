
const path = require('path');
const GitHub = require('github-api');
const fs = require('fs-extra');
const request = require('request');
const globby = require('globby');
const parseGithubUrl = require('parse-github-url');
const SHA1 = require("crypto-js/sha1");
const Zip = require("adm-zip");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const Rsync = require('rsync');

const inputFunc = async function({universe, SELF, INPUT, PATH}){

  console.log('--Service:', SELF.name);
  
  console.log('Exporting to GitHub2');

  let allowedTypes = ['types.second.default.export_nodes_with_options'];
  if(allowedTypes.indexOf(INPUT.type) === -1){
    return {
      type: 'types.second.default.error',
      data: {
        error: true,
        message: 'Invalid type for INPUT, expecting "types.second.default.export_nodes_with_options"'
      }
    }
  }

  // INPUT.data = {
  //   ghUser,
  //   ghToken,
  //   nodePathsToWriteWithFiles // array of paths 
  // }

  // For each path, fetch files (ignore node_modules, build artifacts [.second-ignore]?) 

  // write to /nodes and /paths directories 

  // console.log({
  //   INPUT, 
  //   PATH
  // });
  // return {
  //   INPUT, PATH
  // }

  let finalZipPath = '/tmp/zipped-' + Date.now() + '.zip';
  var zip = new Zip();


  let {
    ghUser,
    ghToken,
    nodePathsToWriteWithFiles, // array of paths 
    repoUrl
  } = INPUT.data;

// use pre-generated OAuth token for basic auth 

  let ghRepoParsed = parseGithubUrl(repoUrl);
  // {
  //   "owner": "secondai",
  //   "name": "app.second.sample_install",
  //   "repo": "secondai/app.second.sample_install",
  //   "branch": "master"
  // }


  console.log('nodePathsToWriteWithFiles',nodePathsToWriteWithFiles);

  // Fetch nodes/files 
  let nodesToWrite = {};
  for(let nodePath of nodePathsToWriteWithFiles){

    // get node data 
    let nodeData = await universe.getNodeAtPath(nodePath, {excludeChildren: true});
    // nodesToWrite['nodes/' + nodePath + '.json'] = JSON.stringify(nodeData, null, 2)
    let content = JSON.stringify(nodeData, null, 2);
    zip.addFile('nodes/' + nodePath + '.json', Buffer.alloc(content.length, content), null); // leaving out 'entry comment' at end 
    console.log('addNode:', nodePath);

    let cwd = path.join(universe.env.ATTACHED_VOLUME_ROOT, nodePath) + '/';
    // console.log('CWD:', cwd);
    // return {};

    // get file data (directory) 
    let fileOpts = {
      // force 
      cwd,
      // stats: false,
      followSymlinkedDirectories: false,
      ignore: [
        '**/node_modules/**',
        // 'frontend/node_modules',
        // 'frontend/node_modules/**',
        // '{,!(node_modules)/**}'
      ],
      gitignore: false, // TODO: second-ignore ? 
      onlyFiles: true,
      expandDirectories: true,
      dot: true
      // onlyFiles: false,
      // onlyDirectories: false,
      // markDirectories: true
    }
    // make sure directory exists 
    // - otherwise, skip 
    let isDir;
    try {
      isDir = fs.lstatSync(cwd);
    }catch(err){
      console.error('Directory doesnt exist:', nodePath);
      continue;
    }
    // console.log(isDir);
    if(isDir && isDir.isDirectory()){
      let matches = await globby('*/**', fileOpts)
      console.log('File matches for', nodePath, ':', matches.length);

      for(let match of matches){
        let internalFilePath = path.join(cwd, match);
        console.log('internalFilePath:', internalFilePath);
        try {

          // zip.addLocalFile(internalFilePath, 'files/' + match); // broken, adds files as folders
          let fileBuffer = fs.readFileSync(internalFilePath);
          zip.addFile('files/' + nodePath + '/' + match, fileBuffer, '', 0644 << 16);
          console.log('addFile:', internalFilePath, 'files/' + nodePath + '/' + match);
          // let fileData = fs.readFileSync(internalFilePath);
          // fileData = fileData.toString('base64');
          // nodesToWrite['files/' + match] = fileData; //fileData.toString();
          // // console.log('filedata:', fileData);
        }catch(err){
          console.error('fs.readFileSync (or zip.addFile) error:', err, internalFilePath);
        }
      }

    } else {
      console.error('No directory for:', nodePath);
    }

  }

  // create root file
  let rootContent = '';
  zip.addFile('second-root', Buffer.alloc(rootContent.length, rootContent), null); // leaving out 'entry comment' at end 

  
  let finalZipPathExtracted = finalZipPath + '/files/';
  let repoCloneToUrl = finalZipPath + '/repofiles/';

  console.log({finalZipPathExtracted, repoCloneToUrl});
  // return false;

  // write zip to path 
  console.log('Writing zip');
  // zip.writeZip(finalZipPathExtracted);

  let giturl = `https://${ghToken}@github.com/${ghRepoParsed.repo}.git`;

  // Clone the git repo here
  let gitCommand1 = `git clone ${giturl} ${repoCloneToUrl}`;
  console.log('gitCommand1:', gitCommand1);
  var { error, stdout, stderr } = await exec(gitCommand1);
  console.log('gitCommand1 stdout:', stdout);
  console.error('gitCommand1 stderr:', stderr);
  // return false
  // remove .git if exists?
  // - TODO: check this doesn't cause problems 
  // zip.deleteFile('.git/*');

  let gitCommand2 = `ls -al ${repoCloneToUrl}`;
  console.log('gitCommand2:', gitCommand2);
  var { error, stdout, stderr } = await exec(gitCommand2);
  console.log('gitCommand2 stdout:', stdout);
  console.error('gitCommand2 stderr:', stderr);

  zip.extractAllTo(finalZipPathExtracted, true); // overwrite! 
  console.log('Extracted zip');
  // - do NOT overwrite .git 

  // Build the command
  var rsync = new Rsync()
    // .shell('ssh -p 2222')
    .flags('v')
    .recursive()
    .compress()
    .progress()
    .delete()
    .exclude(['node_modules','.DS_Store','.git']) // .git ok? 
    .source(finalZipPathExtracted)
    .destination(repoCloneToUrl);


  function runSync(){
    return new Promise((resolve)=>{
      // Execute the command
      rsync.execute(function(error, code, cmd) {
        console.log('Synced. Error:', error, 'ExitCode:', code); //, cmd);
        resolve({error, code, cmd});
      });
    });
  }

  console.log('Running rsync');
  var {error, code, cmd} = await runSync();
  console.log('rsync output:', error, code, cmd);


  let gitCommand3 = `cd ${repoCloneToUrl} && git add . && git add -u && git -c user.name='${'TempUser'}' -c user.email='${'tempemail@example.com'}' commit -m 'autocommit' && git push origin master`;
  console.log('gitCommand3:', gitCommand3);
  var { error, stdout, stderr } = await exec(gitCommand3);
  console.log('gitCommand3 stdout:', stdout);
  console.error('gitCommand3 stderr:', stderr);
  return false;


  
  // console.log('repoUrl:', repoUrl);
  // console.log('Remote Git Repo Info:', ghRepoParsed);
  // // return false;
  
  // const gh = new GitHub({
  //   username: ghUser,
  //   password: ghToken
  // });
  
  // let Repo = gh.getRepo(ghRepoParsed.owner, ghRepoParsed.name);
  
  // console.log('Repo:'); //, Repo);
  

  // // Fetch nodes/files 
  // let nodesToWrite = {};
  // for(let nodePath of nodePathsToWriteWithFiles){

  //   // get node data 
  //   let nodeData = await universe.getNodeAtPath(nodePath, {excludeChildren: true});
  //   nodesToWrite['nodes/' + nodePath + '.json'] = JSON.stringify(nodeData, null, 2)

  //   let cwd = path.join(universe.env.ATTACHED_VOLUME_ROOT, nodePath) + '/';
  //   // console.log('CWD:', cwd);
  //   // return {};

  //   // get file data (directory) 
  //   let fileOpts = {
  //     // force 
  //     cwd,
  //     // stats: false,
  //     followSymlinkedDirectories: false,
  //     ignore: [
  //       '**/node_modules/**',
  //       // 'frontend/node_modules',
  //       // 'frontend/node_modules/**',
  //       // '{,!(node_modules)/**}'
  //     ],
  //     gitignore: false, // TODO: second-ignore ? 
  //     onlyFiles: true,
  //     expandDirectories: true,
  //     dot: true
  //     // onlyFiles: false,
  //     // onlyDirectories: false,
  //     // markDirectories: true
  //   }
  //   // make sure directory exists 
  //   // - otherwise, skip 
  //   let isDir;
  //   try {
  //     isDir = fs.lstatSync(cwd);
  //   }catch(err){
  //     console.error('Directory doesnt exist:', nodePath);
  //     continue;
  //   }
  //   // console.log(isDir);
  //   if(isDir && isDir.isDirectory()){
  //     let matches = await globby('*/**', fileOpts)
  //     console.log('File matches for', nodePath, ':', matches.length);

  //     for(let match of matches){
  //       let internalFilePath = path.join(cwd, match);
  //       console.log('internalFilePath:', internalFilePath);
  //       try {
  //         let fileData = fs.readFileSync(internalFilePath);
  //         fileData = fileData.toString('base64');
  //         nodesToWrite['files/' + match] = fileData; //fileData.toString();
  //         // console.log('filedata:', fileData);
  //       }catch(err){
  //         console.error('fs.readFileSync error:', err, internalFilePath);
  //       }
  //     }

  //   } else {
  //     console.error('No directory for:', nodePath);
  //   }

  // }

  // // return {}


  // // Create a new Branch, not commit directory to master  
  // // - squash commits when merging!
  // let tmpBranch = 'tmp-' + (new Date()).getTime();
  // let createdBranch = await Repo.createBranch(ghRepoParsed.branch, tmpBranch);
  
  // console.log('createdBranch'); //, createdBranch);
  
  // let createdBranchSha = createdBranch.data.object.sha;
  
  // let {data} = await Repo.getRef('heads/master');
  // console.log('Ref Data:'); //, data);
  
  // let masterRefSha = data.object.sha;
  
  // // Get Tree for sha 
  // // - using createdBranchSha (NOT masterRefSha) 
  // let treeResult = await Repo.getTree(`${createdBranchSha}?recursive=true`);
  // console.log('treeResult'); //, treeResult);
  // let treeData = treeResult.data;
  // let tree = treeData.tree;
  
  // // Create new tree 
  // // - including "content" instead of sha, expecting < 1 MB files (otherwise causes problems!?)
  // let newTree = tree.filter(treeNode=>{
  //   return (
  //     (treeNode.path.indexOf('nodes/') !== 0) 
  //     && 
  //     (treeNode.path.length > 6)
  //   )
  // })
  
  // // iterate over new files, see if old exists (and if SHA needs to be updated) 
  // // - will ignore/handle deleted or moved files 
  // let ghFilesByPath = {};
  // let changes = 1;
  // for(let node of tree){
  //   ghFilesByPath[node.path] = node;
  // }
  // console.log('ghFilesByPath'); //, ghFilesByPath);
  // for(let filepath of Object.keys(nodesToWrite)){
  //   let ghNode = ghFilesByPath[filepath];
  //   let newSha;
  //   if(ghNode){
  //     // exists, update necessary? 
      
  //     // sha1("blob " + filesize + "\0" + data)
  //     newSha = SHA1("blob " + nodesToWrite[filepath].length + "\0" + nodesToWrite[filepath]).toString();
      
  //     if(newSha == ghNode.sha){
  //       console.log('No Change:', filepath);
  //       newTree.push(ghNode);
  //     } else {
  //       console.log('Updated:', filepath, newSha, ghNode.sha);
  //       changes++;
  //       // delete first, so that squashed merge works later! 
        
  //       console.log('Updating ' + filepath, typeof nodesToWrite[filepath], nodesToWrite[filepath].length);
        
  //       newTree.push({
  //         path: filepath,
  //         type: 'blob', // tree
  //         mode: '100644', // 040000
  //         content: nodesToWrite[filepath],
  //         // encoding: (filepath.indexOf('files/') > -1) ? 'base64':null
  //       });

  //       // console.log('CONTENT:', typeof nodesToWrite[filepath]);
        
  //       // await Repo.deleteFile(tmpBranch, path);
  //       // await Repo.writeFile(tmpBranch, path, nodesToWrite[path], 'commit message', {
  //       //   encode: true
  //       // });
        
  //     }
  //   } else {
  //     // doesn't exist 
  //     // - needs to be added 
  //     console.log('New');
      
  //     // sha1("blob " + filesize + "\0" + data)
  //     // newSha = universe.SHA1("blob " + nodesToWrite[path].length + "\0" + nodesToWrite[path]).toString();
      
  //     newTree.push({
  //       path: path,
  //       type: 'blob', // tree
  //       mode: '100644', // 040000
  //       content: nodesToWrite[path]
  //     });
      
  //   }
  // }
  
  // console.log('Creating tree');
  // let createdTree = await Repo.createTree(newTree); // include "treeData.sha" as second parameter to not delete any files? 
  // console.log('CreatedTree:'); //, createdTree);
  
  // let newTreeSha = createdTree.data.sha;
  
  // // Create a new commit to temporary branch 
  // let newCommit = await Repo.commit(createdBranchSha, newTreeSha, 'test-tree-commit');
  
  // console.log('newCommit'); //, newCommit);
  
  // let newCommitSha = newCommit.data.sha;
  
  // // Update HEAD of branch 
  // console.log('Update HEAD of tmp branch?');
  // await Repo.updateHead('heads/' + tmpBranch, newCommitSha);
    
  // if(changes || 1==1){
  
  //   console.log('Create Temp PR');
    
  //   let pr;
  //   try {
  //     pr = await Repo.createPullRequest({
  //       title: 'Temporary Pull Request, should auto-remove in moments',
  //       head: [ghRepoParsed.owner, tmpBranch].join(':'),
  //       base: ghRepoParsed.branch
  //     });
  //   }catch(err){
  //     console.error('Failed creating PR:', err);
  //     // return WINDOW.alert('Failed creating PR, likely no changes');
  //     return {error: true}
  //   }
    
  //   console.log('PR:'); //, pr);
    
  //   console.log('PR Number:', pr.data.number);
    
  //   console.log('Merge Temp PR');
    
  //   let merged;
  //   try {
  //     merged = await Repo.mergePullRequest(pr.data.number, {
  //       commit_title: 'squashed merge title',
  //       commit_message: 'squashed merge message',
  //       merge_method: 'squash'
  //     });
  //   }catch(err){
  //     console.error('Failed merging PR:', err);
  //     return {error: true}
  //   }
    
  //   console.log('merged'); //, merged);
  // } else {
  //   // no PR necessary, no changes made! 
  // }
  
  // console.log('Remove Branch');
  
  // // delete tmp branch (remove reference?)  
  // await Repo.deleteRef(`heads/${tmpBranch}`);
  
  // // if(changes){
  // //   WINDOW.alert('Changes made: ' + changes);
  // // } else {
  // //   WINDOW.alert('No Changes to Make!');
  // // }
  
  console.log('Done, cleaned up tmpBranch!');
  
  return {
    type: 'testing_response',
    data: {
      test: true
    }
  }

 }


module.exports = inputFunc;

