'use strict';

const databaseId = ""; // Database ID for the notion table
const token = ""; // Notion API Token
const username = ""; // Vocabulary.com username
const password = ""; // ^^             password
const rapidApiKey = ""; // API Key to get detailed info about words 

const VocApi = require("voc-api");
const { Client } = require('@notionhq/client');
const async = require("async");
const http = require("https");

const notion = new Client({ auth: token });

const voc = new VocApi();

function getDetailed(word, callback) {
    const options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": encodeURI("/words/" + word),
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": rapidApiKey,
            "useQueryString": true
        }
    };
    let result;
    const req = http.request(options, function (res) {
        const chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            const body = Buffer.concat(chunks).toString()
            result = JSON.parse(body);
            callback(result);
        });
    });

    req.end();

}

const firstqueue = async.queue((task, completed) => {
    const result = checkWord(task)
    .then(() => {
        setTimeout(() => {
            const remaining = firstqueue.length()
            completed(null, { task, remaining, result });
        }, 1000)
    })
    .catch(() => {
        setTimeout(() => {
            const remaining = firstqueue.length()
            const error = new Error("Failed to add word");
            completed(error, { task, remaining });
        }, 1000)
    })
    
}, 1)
const secondqueue = async.queue((task, completed) => {
    addWordToNotion(task.word, task.number, task.shortDef, task.longDef, task.example, task.POS, task.secondaryDefs)
    .then(() => {
        setTimeout(() => {
            const remaining = firstqueue.length()
            completed(null, { task, remaining });
        }, 1000)
    })
    .catch(() => {
        setTimeout(() => {
            const remaining = firstqueue.length()
            const error = new Error("Failed to add word");
            completed(error, { task, remaining });
        }, 1000)
    })
    
}, 1)

async function checkLists() {
    voc.login(username, password)
        .then(() => {

            voc.getLists()
                .then(lists => {
                    console.log(lists.length);
                    return
                    for (let ii = 0; ii < lists.length; ii++) {

                        const _list = lists[ii];
                        const id = _list.wordlistid;


                        voc.getList(id)
                            .then(list => {

                                const name = list.name;

                                const exp = /\(?(\d*)\-(\d*)\)?/gm
                                const dateexp = /202\d/m
                                const range = exp.exec(name);
                                let _min, _max, __min, __max, min, max;
                                _min = dateexp.test(range[1]) ? range[3] : range[1];
                                _max = dateexp.test(range[2]) ? range[4] : range[2];
                                min = parseInt(_min);
                                max = parseInt(_max);
                                
                                //list.words.reverse();
                                for (let i = parseInt(_min); i <= max; i++) {
                                    const word = list.words[i - min];
                                    
                                    firstqueue.push(i, (error, { task, remaining, result }) => {
                                        if (error || result || !word || !word.word) {
                                            // Return if : Error, word is already there, somehow the word is null/undefined
                                            return;
                                        }
                                        
                                        getDetailed(word.word, (dword) => {
                                            const secondaryDefs = [];
                                            dword.results.forEach(element => {
                                                secondaryDefs.push({
                                                    word: element.definition,
                                                    POS: element.partOfSpeech,
                                                    synonyms: element.synonyms ? element.synonyms : ["..."],
                                                    examples: element.examples ? element.examples : ["..."]
                                                })
                                            });
                                            secondqueue.push({
                                                word: word.word,
                                                shortDef: word.shortdefinition,
                                                longDef: word.definition,
                                                example: word.example ? word.example.text : "",
                                                POS: secondaryDefs[0] ? secondaryDefs[0].POS : "None Available",
                                                secondaryDefs: secondaryDefs,
                                                number: i
                                            }, (error, { }) => {
                                                if (error) {
                                                    return;
                                                }
                                            })
                                        })


                                    })
                                }
                            }).catch(e => {
                                console.log(e);
                            })
                    }
                })
                .catch(e => {
                    console.log(e);
                })

        }).catch(e => {
            console.log(e)
        })
}
async function checkWord(number) {

    await notion.databases.query({
        database_id: databaseId,
        filter: {
            and: [
                {
                    property: "Vocab Number",
                    number: {
                        equals: number
                    }
                }

            ]
        }
    })
        .then(result => {

            if (result.results.length > 0) {
                return true;
            } else {
                return false;
            }
        })
        .catch(() => {

            return false;
        })
}

async function addWordToNotion(word, number, shortDef = "No definition available", longDef = "No definition available", example = "No example available", partOfSpeech = "...", secondaryDefs = []) {
    const children = [];

    //const def = secondaryDefs[0];
    for (let ii = 0; ii < secondaryDefs.length && ii < 3; ii++) {
        const def = secondaryDefs[ii];
        if (def) {
            if (!partOfSpeech || partOfSpeech === undefined) {
                partOfSpeech = def.POS
            }
            var synonyms = def.synonyms.filter(element => element !== undefined);
            var examples = def.examples.filter(element => element !== undefined);
            children.push({
                object: "block",
                type: "heading_3",
                heading_3: {
                    text: [
                        {
                            type: 'text',
                            text: {
                                content: def.word + " (" + def.POS + ")"
                            }
                        }
                    ]
                }
            }, {
                object: "block",
                type: "heading_2",
                heading_2: {
                    text: [{
                        type: "text",
                        text: {
                            content: "Synonyms"
                        }
                    }]
                }
            })
    
            for (let i = 0; i < synonyms.length; i++) {
                children.push({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                        text: [
                            {
                                type: "text",
                                text: {
                                    content: synonyms[i]
                                }
                                
                            }
                        ]
                    }
                })
            }
            children.push({
                object: "block",
                type: "heading_2",
                heading_2: {
                    text: [{
                        type: "text",
                        text: {
                            content: "Examples"
                        }
                    }]
                }
            })
            for (let i = 0; i < examples.length; i++) {
                children.push({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                        text: [
                            {
                                type: "text",
                                text: {
                                    content: examples[i]
                                }
                                
                            }
                        ]
                    }
                })
            }
        }
    }
    




    await notion.pages.create({ // May be outdated
        parent: {
            database_id: databaseId
        },
        icon: {
            type: "emoji", emoji: "💬"
        },
        properties: {
            Name: {
                title: [
                    {
                        text: {
                            content: word
                        }
                    }
                ]
            },
            "Part of Speech": {
                select: {
                    name: partOfSpeech || def.POS || "..."
                }
            },
            'Long Definition': {
                rich_text: [
                    {
                        text: {
                            content: longDef
                        }
                    }

                ]
            },
            'Short Definition': {
                rich_text: [
                    {
                        text: {
                            content: shortDef
                        }
                    }

                ]
            },
            'Vocab Number': {
                number: number
            }, 
            'Link': {
                url: "https://www.vocabulary.com/definition/" + word
            }
        },
        children: children
    })

        .catch((e) => {

            console.error(e)
        })


}

checkLists();