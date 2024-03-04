import { loadSchemaPEARL, EvaluationReport } from "evaluation-report-juezlti"
import "babel-polyfill"

const { MongoClient } = require("mongodb");

const LANGUAGE = 'MongoDB'
const STATEMENT_TIMEOUT = 2000
const MAX_RESULT_ROWS = 1000

var globalProgrammingExercise = {}

async function evalMongoDB(programmingExercise, evalReq) {
    return new Promise((resolve) => {
        globalProgrammingExercise = programmingExercise
        loadSchemaPEARL().then(async () => {

            var evalRes = new EvaluationReport(),
                response = {},
                summary = {
                    "classify" : 'Accepted',
                    "feedback" : 'Well done'
                }

            evalRes.setRequest(evalReq.request)
            let program = evalReq.request.program
            response.report = {}
            response.report.capability = {
                id: "mongo-evaluator",
                features: [{
                        name: "language",
                        value: LANGUAGE,
                    },
                    {
                        name: "version",
                        value: "7.0.6",
                    },
                    {
                        name: "engine",
                        value: "https://www.mongodb.com",
                    },
                ]
            }
            response.report.programmingLanguage = LANGUAGE
            response.report.exercise = programmingExercise.id
            let tests = []
            try {
                let solution_id = ""
                let compilationError = false
                for (let solutions of programmingExercise.solutions) {
                    if (solutions.lang.toUpperCase().includes( LANGUAGE.toUpperCase() )) {
                        solution_id = solutions.id
                        break
                    }
                }
                const solution = programmingExercise.solutions_contents[solution_id]
                for (let metadata of programmingExercise.tests) {
                    let lastTestError = {}
                    let input = programmingExercise.tests_contents_in[metadata.id]
                    let expectedOutput = await getQueryResult(
                        solution, input
                    )
                    let resultStudent = await getQueryResult(
                        program, input
                    )
                    .catch(error => {
                        summary = {
                            "classify" : "Compile Time Error",
                            "feedback" : error.message
                        }
                        compilationError = true
                    })
                    if(!compilationError) {
                        let expectedRows = getRowsFromResult(expectedOutput)
                        let studentRows = getRowsFromResult(resultStudent)
                        if(getGrade(expectedOutput, resultStudent) == 0) {
                            summary = {
                                "classify" : 'Wrong Answer',
                                "feedback" : 'Try it again'
                            }
                        }
                        tests.push(addTest(input, expectedRows, studentRows, metadata))
                    }
                }

            } catch (error) {
                summary = {
                    "classify" : "Compile Time Error",
                    "feedback" : error.message
                }
            } finally {
                response.report.tests = tests
                evalRes.setReply(response)
                evalRes.summary = summary
                resolve(evalRes)
            }
        })
    })
}

function getNameAndPasswordSuffix() {
    const crypto = require('crypto')
    return crypto.randomUUID().replace(/-/g, "")
}

function executeMongosh(queries, dbName) {
    const { spawn } = require('child_process');

        // Conectar a MongoDB utilizando mongosh
        const mongosh = spawn('mongosh', [
            '--eval',
            queries,
            '--host', process.env.MONGO_DB_CONTAINER_NAME,
            '--port', process.env.MONGO_DB_VALIDATOR_PORT,
            dbName
        ]);
        let salidaEstandar = '';
        let salidaError = '';

        mongosh.stdout.on('data', (data) => {
            salidaEstandar += data;
        });
    
        mongosh.stderr.on('data', (data) => {
            salidaError += data;
        });
    
        return new Promise((resolve, reject) => {
            mongosh.on('close', (codigoSalida) => {
                if (codigoSalida === 0) {
                    resolve(salidaEstandar );
                } else {
                    reject(salidaError);
                }
            });
        });

}

async function getQueryResult(queries = null, inputTest) {
    const dbName = getNameAndPasswordSuffix()
    let transactionQueries = ''
        transactionQueries += createOnflySchema()
        transactionQueries += "\n" + queries
        transactionQueries += "\n" + inputTest
        return executeMongosh(transactionQueries, dbName)
        .finally(async () => {
            await executeMongosh("db.dropDatabase()", dbName)
        })
}

function createOnflySchema() {
    let onFlyQueries = '';
    for (let library of globalProgrammingExercise.libraries) {
        let onFlyQuery = globalProgrammingExercise.libraries_contents[library.id]
        onFlyQueries += "\n" + onFlyQuery
    }
    return onFlyQueries;
}

function getRowsFromResult(resultString) {
    console.log(resultString)
    // Divide la cadena por el carácter de nueva línea
    const lines = resultString.split('\n');

    // Encuentra el índice de la línea que contiene el primer elemento del array (comienza con '[')
    const startIndex = lines.findIndex(line => line.trim().startsWith('['));

    // Si no se encuentra el array, devuelve un array vacío
    if (startIndex === -1) {
        return [];
    }

    // Une las líneas del array en una sola cadena
    const arrayString = lines.slice(startIndex).join('\n');

    // Parsea la cadena a un objeto JavaScript
    // Nota: Esto asume que la cadena es un JSON válido
    let resultArray;
    try {
        resultArray = JSON.parse(arrayString);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return [];
    }
console.log("getRowsFromResult", resultArray)
    return resultArray;
}

const addTest = (input, expectedOutput, obtainedOutput, lastTestError, metadata) => {
    const Diff = require('diff')
    obtainedOutput = obtainedOutput ? obtainedOutput : ''
    const outputDifferences = JSON.stringify(Diff.diffTrimmedLines(expectedOutput, obtainedOutput));
    return {
        'input': input,
        'expectedOutput': visibilizeWhiteChars(expectedOutput),
        'obtainedOutput': visibilizeWhiteChars(obtainedOutput),
        'outputDifferences': outputDifferences ? outputDifferences : '',
        'classify': getClassify(expectedOutput, obtainedOutput, lastTestError),
        'mark': getGrade(expectedOutput, obtainedOutput),
        'visible': metadata.visible,
        'hint': metadata.feedback,
        'feedback': getFeedback(expectedOutput, obtainedOutput, lastTestError),
        'environmentValues': []
    }
}

const getGrade = (expectedOutput, obtainedOutput) => {
    return expectedOutput == obtainedOutput ? 100 : 0
}

const getFeedback = (expectedOutput, obtainedOutput, lastTestError) => {
    let feedback = 'Right Answer.'
    // Feedack will be fill by feedback-manager
    if(lastTestError) {
        feedback = lastTestError.toString()
    } else if(getGrade(expectedOutput, obtainedOutput) < 1) {
        feedback = 'Wrong Answer.'
    }
    return feedback
}

const getClassify = (expectedOutput, obtainedOutput, lastTestError) => {
    let classify = 'Accepted'

    if(getGrade(expectedOutput, obtainedOutput) < 1)
        classify = 'Wrong Answer'
    if(lastTestError?.code) {
        switch(lastTestError.code) {
            case 143:
                classify = 'Time Limit Exceeded'
                break
            default:
                classify = 'Runtime Error'
        }
    }
    return classify
}

const visibilizeWhiteChars = (originalString) => {
    const whiteChars = [
        {'in': '\n', 'out': '\u204B\n'},
        {'in': '\t', 'out': '\u2192\t'},
        {'in': ' ', 'out': '\u2591'},
    ]
    let replacedString = originalString;
    whiteChars.forEach(replaceObj => {
        let inRegExp = new RegExp(replaceObj.in, 'g')
        replacedString = replacedString.replace(inRegExp, replaceObj.out)
    })
    return replacedString;
}

module.exports = {
    evalMongoDB
}
