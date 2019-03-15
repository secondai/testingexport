import { AppRegistry } from "react-native";
import App from "./App";

import VersionFile from './version.json'

console.log('Local VersionFile', VersionFile);
let versionTag = 'app.second.sample_pwa.version';
window.localVersion = VersionFile.version; //localStorage.getItem(versionTag);
window.lastCheck = 0;

window.checkLatestVersion = function(){
  if((Date.now() - window.lastCheck) < (10 * 1000)){
    window.console.log('Too soon to checkLatestVersion');
    return;
  }
  window.lastCheck = Date.now();
  // window.alert('checking for update');
  fetch('/app/app.second.sample_pwa/version.json?' + Date.now())
  .then(response=>{
    return response.json();
  })
  .then((remoteVersion)=>{
    window.console.log('Remote Version:', remoteVersion)
    window.remoteVersion = remoteVersion.version;
    // window.location.reload(true)
    // let localVal = localStorage.getItem('test123479');
    // window.alert(['NEW:', text, 'localVersion:', localVersion].join("\n"));
    if(!window.localVersion){
      // set first time 
      localStorage.setItem(versionTag, window.remoteVersion);
    } else if(window.localVersion != window.remoteVersion){
      // afterwards 
      window.alert('Updating...')
      localStorage.setItem(versionTag, window.remoteVersion);
      window.location.reload(true);
    }
  });
}

window.addEventListener('focus', window.checkLatestVersion, false)

AppRegistry.registerComponent("App", () => App);

AppRegistry.runApplication("App", {
  rootTag: document.getElementById("root")
});
