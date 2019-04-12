'use strict';

const commandLineArgs = require('command-line-args');      // used to parse the CLI
const execSync = require('child_process').execSync;        // used to 'shell out' and run system commmands
const csvjson = require('csvjson');                        // used to consume csv and place in json object
const fs = require('fs');                                  // used for file IO
const tmp = require('tmp');                                // used to create temporary files
const random = require("random-js");                       // used to generate random numbers
 
/** Define what command line options are needed
 *  armfile = file containing the ARM template to deploy
 *  infile = file containing the default thresholds (eg. defaultthresholds.csv)
 *  alertsub = subscription to create the alert in
 *  rg = resource group where the new alerts should be created
 *  ag = Monitoring Action Group Resource ID
 **/

const optionDefinitions = [
    { name: 'armfile', alias: 'r', type: String },
    { name: 'infile', alias: 'i', type: String },
    { name: 'alertsub', alias: 'a', type: String },
    { name: 'rg', type: String },
    { name: 'ag', type: String },
    { name: 'skipexisting', alias: 's', type: String },
    { name: 'filter', alias: 'f', type: String }
  ];

const clOptions = commandLineArgs(optionDefinitions);

// Log the inputs
console.log("ARGS are as follows:");
console.log("\tarmfile:" + clOptions.armfile);
console.log("\tinfile:" + clOptions.infile);
console.log("\talertsub:" + clOptions.alertsub);
console.log("\trg:" + clOptions.rg);
console.log("\tag:" + clOptions.ag);
console.log("\tskipexisting:" + clOptions.skipexisting);
console.log("\tfilter:" + clOptions.filter);

// Create options used for parsing the CSV file
let options = {
    delimiter : ',' , // optional
    quote     : '"' // optional
};

// Consume the CSV named defaultthresholds.csv in the CWD
let inputCsv = fs.readFileSync(clOptions.infile, { encoding : 'utf8'});

// Convert the CSV to a JSON object
let defaultThresholds = csvjson.toObject(inputCsv, options);

// Make sure you're logged in to Azure
let amILoggedIn = undefined;
try {
    amILoggedIn = execSync('az webapp list');
} catch {}

if(amILoggedIn == undefined) {  // assumes someplace in there you'll see an error if you're not logged in
    // ASSERT: You're not logged in and need to do that now!
    execSync('az login');
}

// Change subscriptions to where the work will be done
// Grab ALL resources 
execSync('az account set --subscription ' + clOptions.alertsub);
let azObjs = JSON.parse(execSync('az resource list',{encoding: 'utf8'}));

// Collect all of the existing alerts
let azAlerts = JSON.parse(execSync('az monitor metrics alert list',{encoding: 'utf8'}));


// For every threshold defined in the CSV
for (let metric of defaultThresholds)
{
    // For every resource in the searched subscription
    for (let resource of azObjs)
    {           
        // Ignore anything that's an App Service 'slot' resource type 
        // ASSERT: we do not care about slot based alerts (eg. HTTP server errors)
        if(resource.id.includes("/slots/") && resource.id.includes("Microsoft.Web/sites")) { 
            continue;
        }

        // Define / reset input that will be passed to Azure for creating the alert
        // This needs to be reset for every ARM deploy
        let armParameters = {};
        
        // If the alert's resource provider is found in the resource ID then deploy an alert
        if(resource.id.toLowerCase().indexOf(metric.provider.toLowerCase()) > -1) {
            // Need to create a regexp that extracts the resource group & resource name from the resource ID
            let re = /.*resourceGroups\/(.*)\/providers.*\/(.*)/g;

            // Grab successful matches and put into the resourceInfo array
            let resourceInfo = re.exec(resource.id);

            // Split the data in resourceInfo in the appropriate variables
            let rg = resourceInfo[resourceInfo.length-2];
            let rname = resourceInfo[resourceInfo.length-1];

            // This isn't perfect but will allow you to target specific resources you want to set alerts on
            // Currently this doesn't support wildcarding
            if(clOptions.filter && (!rname.includes(clOptions.filter))) { 
                continue;
            }

            // Build an alert name around the parsed info and fill out the contents of the tmp ARM parameters file
            let aname =  metric.alertName + " on [" + rname + "] in [" + rg + "]";

            // If the array already exists by name, move on to the next one
            if((azAlerts.findIndex(obj => obj.name==aname) >= 0)  && clOptions.skipexisting)  {
                continue;
            }

            console.log("Applying rule: [" + metric.alertName + "] to [" + rname + "] in [" + rg + "]");

            armParameters.$schema = "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#";
            armParameters.contentVersion = "1.0.0.0";
            armParameters.parameters = {
                'alertName' : {
                    'value' : aname
                },                
                'alertSeverity' : {
                    'value' : Number(metric.alertSeverity)
                },
                'metricName' : {
                    'value' : metric.metricName
                },
                'threshold' : {
                    'value' : metric.threshold
                },
                'windowSize' : {
                    'value' : metric.windowSize
                },
                'evaluationFrequency' : {
                    'value' : metric.evaluationFrequency
                },
                'timeAggregation' : {
                    'value' : metric.timeAggregation
                },
                'operator' : {
                    'value' : metric.operator
                },
                'actionGroupId' : {
                    'value' : clOptions.ag
                },
                'resourceId'  : {
                    'value' : resource.id
                }
            };

            // Create a tmp file
            let tmpobj = tmp.fileSync();
            console.log('File: ', tmpobj.name);
            console.log('Filedescriptor: ', tmpobj.fd);

            // Write the above parameters to a temporary file
            fs.writeFileSync(tmpobj.name, JSON.stringify(armParameters));
        
            // Generate a random number so we have a unique deployment name
            let engine = new random(random.engines.mt19937().autoSeed());
            let randomNum = engine.integer(1, 1000000);

            // Build the AZ cli payload to deploy the new alert
            let cmd = "az group deployment create --resource-group " + clOptions.rg + " --name MetricDeployment_" + randomNum + " --parameters @" + tmpobj.name +  " --template-file " + clOptions.armfile;
            console.log(cmd);

            // This is where all the magic happens...it all comes down to this!!
            let output = execSync(cmd);
            console.log(output);            
        }
    }
}

