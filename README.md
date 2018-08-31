# alerts

## Introduction

Basic script and associated files to deploy monitoring and alerting in Azure based on defined thresholds and resource provider tyes.

## Requirements

In order to run the setUpAlerts.js script you'll need the following:
* An Azure subscription ID (**alertsub**) that contains resources you want to monitor and set alerts in
* A resource group (**rg**) where you'll want to deploy these alerts to
* An action group's (**ag**) resource ID that will be used in the alert deployments.  It needs to be in this format: /subscriptions/11111111-1111-1111-1111-1111111111/resourceGroups/my-alert-rg/providers/microsoft.insights/actiongroups/My Alert Group

## Other files
* [metricalert.json aka **armfile**](metricalert.json) is borrowed from an [MS help page](https://docs.microsoft.com/en-us/azure/monitoring-and-diagnostics/monitoring-create-metric-alerts-with-templates)
* [defaultthresholds.csv aka **infile**](defaultthresholds.csv) allows you to define alert rules based on resource provider type

## Execution

\# node setUpAlerts.js --armfile ./metricalert.json --infile ./defaultthresholds.csv --alertsub 11111111-1111-1111-111111 --rg my-alert-rg --ag "/subscriptions/11111111-1111-1111-1111-1111111111/resourceGroups/my-alert-rg/providers/microsoft.insights/actiongroups/My Alert Group"
