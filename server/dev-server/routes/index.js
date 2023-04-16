import express from "express";
import { loadSchemaYAPEXIL, ProgrammingExercise } from "programming-exercise-juezlti";
import { loadSchemaPEARL, EvaluationReport } from "evaluation-report-juezlti";
import dotenv from 'dotenv'
dotenv.config('../env.js');
import evaluator from "../evaluator";
import path from "path";
import request from "request";
import Cache from "cache";
const cache = new Cache(600 * 1000); // Create a cache with 600 second TTL
import fs from "fs";

var router = express.Router();


router.get("/capabilities", function(req, res, next) {
    let evalRes = new EvaluationReport();
    let obj = {
        capabilities: evaluator.capabilities,
    };

    evalRes.setReply(obj);
    res.send(evalRes);
});

router.get("/", function(req, res) {
    let text = fs.readFileSync(
        path.join(__dirname, "../../public/doc/intro.txt"), { encoding: "utf8", flag: "r" }
    );
    let curl_exm = fs.readFileSync(
        path.join(__dirname, "../../public/doc/curl"), { encoding: "utf8", flag: "r" }
    );

    try {
        res.render("index");
    } catch (e) {
        console.log(e);
    }
});

router.post("/eval", async function(req, res, next) {

    await loadSchemaPEARL();
    await loadSchemaYAPEXIL();

    evaluate(req)
        .then(async(obj) => {

            obj.reply.report.user_id = req.studentID
            req.programming_eval_result = obj;

            request({
                    method: "POST",
                    url: process.env.FEEDBACK_MANAGER_URL,
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(req.programming_eval_result)
                },
                function(error, response) {

                    if (error != null || response.statusCode != 200) {
                        res.json(error).status(500);

                    } else {
                        let pearlWithFeedback = JSON.parse(response.body)
                        res.send(pearlWithFeedback);
                    }
                }
            );
        })
        .catch((err) => {
            res.send({ "error": err.message }).status(500);
        });
});

async function evaluate(req) {
    const evalReq = new EvaluationReport();
    if (!evalReq.setRequest(req.body)) {

        console.log("INVALID PEARL")
        throw new Error("INVALID PEARL");
    }

    if ("program" in evalReq.request) {
        const programmingExercise = await getProgrammingExercise(evalReq);
        const assesment = await evaluator.evalProgramming(programmingExercise, evalReq)
        return assesment;
    }
}

async function getProgrammingExercise(evalReq) {

    let programmingExercise = cache.get(evalReq.request.learningObject);

    if (programmingExercise == null) {
        try {
            programmingExercise = await ProgrammingExercise
                .loadRemoteExercise(evalReq.request.learningObject, {
                    'BASE_URL': process.env.BASE_URL,
                    'EMAIL': process.env.EMAIL,
                    'PASSWORD': process.env.PASSWORD,
                });

        } catch (err) {
            throw new Error("LearningObj not found")
        }
        cache.put(evalReq.request.learningObject, programmingExercise)
        return programmingExercise;

    } else {
        return programmingExercise;
    }
}

export { router };
