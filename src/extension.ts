"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import vscode = require("vscode");
import {
  HoverProvider,
  Hover,
  MarkdownString,
  TextDocument,
  Position,
  CancellationToken,
  WorkspaceConfiguration
} from "vscode";
import axios, { AxiosError } from "axios";

//import { OpenFIGIAPIResponse } from "./types/OpenFIGIAPIResponseType";
import { OutgoingHttpHeaders } from "http";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider("*", new ISINCodeHoverProvider())
  );
}

function checkSedol(text:any){
	var weight = [1, 3, 1, 7, 3, 9, 1];
	try {
		var input = text.substr(0,6);
		var check_digit = sedol_check_digit(input);
		return text == input + check_digit;
	} catch(e) {
		return false;
	}       
	
    
	function sedol_check_digit(char6:any) {
	    if (char6.search(/^[0-9BCDFGHJKLMNPQRSTVWXYZ]{6}$/) == -1){
	        throw "Invalid SEDOL number '" + char6 + "'";
	    }
	    var sum = 0;
	    for (var i = 0; i < char6.length; i++){
	        sum += weight[i] * parseInt(char6.charAt(i), 36);
	    }
	    var check = (10 - sum%10) % 10;
	    return check.toString();
	}
}

class ISINCodeHoverProvider implements HoverProvider {
    private isinCodeConfig: WorkspaceConfiguration;

    constructor() {
        this.isinCodeConfig = vscode.workspace.getConfiguration('isin-code');
    }

  public async provideHover(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): Promise<Hover> {
    let wordRange = document.getWordRangeAtPosition(position);
    let word = wordRange ? document.getText(wordRange) : "";
    let isinCodeMatch = word.match(/[A-Z]{2}[A-Z0-9]{9}\d/);
    let sedolCodeMatch = word.match(/^[0-9BCDFGHJKLMNPQRSTVWXYZ]{7}$/);
    let cusipCodeMatch = word.match(/^[0-9BCDFGHJKLMNPQRSTVWXYZ]{9}$/);

    if (!wordRange || (!isinCodeMatch && !sedolCodeMatch && !cusipCodeMatch)) {
      return Promise.resolve(new Hover(""));
    }
    var data1 = [{ idType: "id", idValue: "value" }]
    if(isinCodeMatch){
        var data1 = [{ idType: "ID_ISIN", idValue: isinCodeMatch[0] }];
    } else if(sedolCodeMatch){
        if(!checkSedol(sedolCodeMatch[0])){
            return Promise.resolve(new Hover("Not a valid SEDOL"));
        } else {
            var data1 = [{ idType: "ID_SEDOL", idValue: sedolCodeMatch[0] }];   
        }
    } else if(cusipCodeMatch){
        var data1 = [{ idType: "ID_CUSIP", idValue: cusipCodeMatch[0] }];   
    } else {
        return Promise.resolve(new Hover(""));
    }

    let headers: OutgoingHttpHeaders = {
        'Content-Type': 'application/json',
    };

    if (this.isinCodeConfig.OpenFIGIAPIKey !== '') {
        headers['X-OPENFIGI-APIKEY'] = this.isinCodeConfig.OpenFIGIAPIKey;
    }
    return axios
      .request({
          'url': 'https://api.openfigi.com/v1/mapping',
          'method': 'POST',
          'data': data1,
          headers
      }
        )
      .then((response: { data:any }) => {
        const firstData = response.data[0];
        const name = firstData.data[0].name;
        const type = 'Security Type: ' + firstData.data[0].securityType + ' / ' +  firstData.data[0].securityType2;
        const marketSector = 'Market Sector: '.concat(firstData.data[0].marketSector);
        const exchCode = 'Exchange Code: '.concat(firstData.data[0].exchCode);
        const ticker = 'Ticker: '.concat(firstData.data[0].ticker);
        const securityDescription = 'Description: '.concat(firstData.data[0].securityDescription);
        const numberOfMatches = 'Number of matches: '.concat(firstData.data.length);
        let hoverTexts: MarkdownString[] = [];
        hoverTexts.push(
          new MarkdownString(`` + `**${name}**\n\n ` + `_${type}_\n\n `+ `${marketSector}\n\n `+ `${exchCode} (${numberOfMatches})\n\n `+ `${ticker}\n\n `+ `${securityDescription}\n\n ` )
        );
        let hover = new Hover(hoverTexts);
        return hover;
      })
      .catch((error: AxiosError) => {
        if (error.response && error.response.status === 429) {
          return new Hover(
            "You made too many requests, wait a minute and try again or register for free on OpenFIGI (see README for details)."
          );
        }
        return new Hover(
          "Error: could not retrieve the name corresponding to that ISIN Code.");
      });
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
