import { loadSchemaPEARL, EvaluationReport } from "evaluation-report-juezlti"
import "babel-polyfill"
import { Console } from "console"

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
                        let expectedRows = getJSONFromResult(expectedOutput)
                        let studentRows = getJSONFromResult(resultStudent)
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
            '--quiet',
            '--eval',
            queries,
            '--host', process.env.MONGO_DB_CONTAINER_NAME,
            '--port', process.env.MONGO_DB_VALIDATOR_PORT,
            dbName
        ]);
        let salidaEstandar = '';
        let salidaError = '';

        mongosh.stdout.on('data', (data) => {
            //asociar data a salidaEstandar si la longitud de data es > 0
            if(data.length > 0)
                salidaEstandar = data.toString();
        });
    
        mongosh.stderr.on('data', (data) => {
            salidaError += data;
        });
    
        return new Promise((resolve, reject) => {
            mongosh.on('close', (codigoSalida) => {
                if (codigoSalida === 0) {
                    resolve(salidaEstandar);
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

function getJSONFromResult(resultString) {

    // Parsea la cadena a un objeto JavaScript
    const resultArray = resultString
        .replace(/(\w+):/g, '"$1":')
        .replace(/ObjectId\('([^']*)'\)/g, '"$1"')
        .replace(/'/g, '"');

    return resultArray;
}

function jsonParse(string) {
    const { EJSON } = require('bson');
    return EJSON.parse(string
        .replace(/\n/g, '')
        .replace(/\s/g, '')
    );

}

const addTest = (input, expectedOutput, obtainedOutput, metadata) => {
    const Diff = require('diff')
    obtainedOutput = obtainedOutput ? obtainedOutput : ''
    const outputDifferences = JSON.stringify(Diff.diffJson(jsonParse(expectedOutput), jsonParse(obtainedOutput)));
    return {
        'input': input,
        'expectedOutput': expectedOutput, // visibilizeWhiteChars(expectedOutput),
        'obtainedOutput': obtainedOutput, // visibilizeWhiteChars(obtainedOutput),
        'outputDifferences': outputDifferences ? outputDifferences : '',
        'classify': getClassify(expectedOutput, obtainedOutput),
        'mark': getGrade(expectedOutput, obtainedOutput),
        'visible': metadata.visible,
        'hint': metadata.feedback,
        'feedback': getFeedback(expectedOutput, obtainedOutput),
        'environmentValues': []
    }
}

const getGrade = (expectedOutput, obtainedOutput) => {
    return expectedOutput == obtainedOutput ? 100 : 0
}

const getFeedback = (expectedOutput, obtainedOutput) => {
    let feedback = 'Right Answer.'
    if(getGrade(expectedOutput, obtainedOutput) < 1) {
        feedback = 'Wrong Answer.'
    }
    return feedback
}

const getClassify = (expectedOutput, obtainedOutput) => {
    let classify = 'Accepted'

    if(getGrade(expectedOutput, obtainedOutput) < 1)
        classify = 'Wrong Answer'
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
