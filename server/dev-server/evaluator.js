import { loadSchemaPEARL, EvaluationReport } from "evaluation-report-juezlti"
import "babel-polyfill"

const { MongoClient } = require("mongodb");

const LANGUAGE = 'MongoDB'
const STATEMENT_TIMEOUT = 2000
const MAX_RESULT_ROWS = 1000

var globalProgrammingExercise = {}
const dbName = getNameAndPasswordSuffix()


async function evalMongoDB(programmingExercise, evalReq) {
    console.log("evalMongoDB")
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
                    console.log("Obtenida la solución prevista", expectedOutput)
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
                    console.log("Obtenida la solución del estudiante", resultStudent)
                    if(!compilationError) {
                        // let expectedRows = getRowsFromResult(expectedOutput)
                        // let studentRows = getRowsFromResult(resultStudent)
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

async function getQueryResult(queries = null, inputTest) {
    const { fork } = require('child_process');
    const path = require('path');
    try {
        const connection = await initTransaction()
        // Send a ping to confirm a successful connection
        // await connection.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        console.log("queries", queries)
          // Crear un proceso hijo
        const mongosh_process = fork(path.join(__dirname, 'mongosh_child.js'));

        // Enviar la consulta al proceso hijo
        mongosh_process.send({ consulta: queries });

        // Manejar la respuesta del proceso hijo
        mongosh_process.on('message', async (resultQuerySolution) => {
            console.log("resultQuerySolution", resultQuerySolution)
            return resultQuerySolution
            /*
            if(resultQuerySolution?.rowCount > MAX_RESULT_ROWS) {
                return(new Error('Too long result'))
            }

            resultQueryInput = await executeInputTest(connection, inputTest)
            console.log("resultQueryInput", resultQueryInput)
            let resultQuery = resultQueryInput.constructor.name == 'Result' // When exists at least one SELECT into test IN.
                ? resultQueryInput
                : resultQuerySolution

            return resultQuery
            */
        });

        // Manejar errores en el proceso hijo
        mongosh_process.on('error', (error) => {
            console.log({ error: error.message });
        });
      } catch(err) {
        console.log(err); // TypeError: failed to fetch
      } finally {
        // Ensures that the client will close when you finish/error
        await endTransaction(connection)
      }
}

async function executeInputTest(connection, inputTest) {
    console.log("executeInputTest")
    let executedQueries = []
    let resultQuery = {}
    inputTest.trim().split(';').forEach(inputQuery => {
        executedQueries.push(connection.eval(`function() { return ${inputQuery}; }`))
    });
    Promise.allSettled(executedQueries)
    .then((resultQueries) => {
        if(Array.isArray(resultQueries)) {
            let selectFound = false
            let index = resultQueries.length
            while(!selectFound && --index >= 0) {
                if(resultQueries[index]?.value?.command?.toUpperCase() == 'SELECT') {
                    selectFound = true
                    resultQuery = resultQueries[index].value
                }
            }
        }
        resolve(resultQuery) // return last SELECT execution
    })
}

async function getConnection () {
    const host = process.env.MONGO_DB_CONTAINER_NAME
    const port = process.env.MONGO_DB_VALIDATOR_PORT
    const uri = `mongodb://${host}:${port}/${dbName}`
    const connection = new MongoClient(uri)
    return connection
}

async function createOnflySchema(connection) {
    console.log("createOnFlySchema")
    let onFlyPromises = []
    for (let library of globalProgrammingExercise.libraries) {
        let onFlyQuery = globalProgrammingExercise.libraries_contents[library.id]
        onFlyPromises.push(connection.eval(`function() { return ${onFlyQuery}; }`))
    }
    return Promise.all(onFlyPromises)
}

async function dropOnflySchema (connection) {
    return connection.command('dropDatabase')
}

function getNameAndPasswordSuffix() {
    const crypto = require('crypto')
    return crypto.randomUUID().replace(/-/g, "")
}

async function initTransaction() {
    console.log("initTransaction")
    try {
        const connection = await getConnection()
        await createOnflySchema(connection)
        return Promise.resolve(connection)
    } catch(error) {
        return Promise.reject(error)
    }
}

async function endTransaction(connection) {
    return dropOnflySchema(connection)
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
