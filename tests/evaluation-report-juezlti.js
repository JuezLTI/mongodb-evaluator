const chai = require('chai');
const expect = chai.expect
const { loadSchemaPEARL, EvaluationReport } = require("evaluation-report-juezlti");
describe('Test for EvaluationReport', async function() {
    before(async function() {

        await loadSchemaPEARL();
    });

    it('Testing setId ', function() {
        let evaluationReport = new EvaluationReport()

        expect(evaluationReport.setId('00000000-0000-0000-0000-000000000000')).to.equal(true);

    })

    it('Testing setDate ', function() {
        let evaluationReport = new EvaluationReport()

        expect(evaluationReport.setDate('2020-10-22T05:30:22.569Z')).to.equal(true);

    })
    it('Testing setReply', function() {
        let evaluationReport = new EvaluationReport()

        expect(evaluationReport.setReply({
            "token": 123
        })).to.equal(true)

    })
    it('Testing setRequest', function() {
        let evaluationReport = new EvaluationReport()

        expect(evaluationReport.setRequest({
            "date": `${(new Date()).toISOString()}`,
            "program": "count(//node())",
            "learningObject": "00000000-0000-0000-0000-000000000000"

        })).to.equal(true)

    })


})