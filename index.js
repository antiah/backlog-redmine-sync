const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;


const API_KEY = "7c1bc7a19a77f28e54be104398f10be9b5bd0b92";
const REDMINE_URL = "http://157.7.87.189";
const corsAnywhere = "https://cors-anywhere.herokuapp.com/";

// Parse JSON body
app.use(express.json());

app.post("/webhook", async (req, res) => {
    try {
        const data = req.body;
        const issueData = data.content; // Backlog gửi trong content
        console.log('data :>> ', data);
        console.log('issueData :>> ', issueData);
        // Kiểm tra nếu không phải sự kiện tạo issue
        if (!issueData || !issueData.summary) {
            return res.status(400).send("No valid issue data");
        }

        const subject = issueData.summary;
        const description = issueData.description || "Tạo từ Backlog";

        const redmineBody = {
            issue: {
                project_id: 52, // Sửa theo Redmine
                subject: subject,
                description: description,
                tracker_id: 3, // Loại issue: 1 = Bug, 2 = New Feature, 3 = Support, 4 = Repair, 5 = Research & Study
                status_id: 1,   // 1 = T do
            }
        };

        const response = await fetch(`${REDMINE_URL}/issues.json`, {
            method: "POST",
            headers: {
                "X-Redmine-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(redmineBody),
        });
        console.log('response :>> ', response);
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Redmine Error:", errorData);
            return res.status(500).json({ error: "Failed to create Redmine issue", detail: errorData });
        }

        const result = await response.json();
        console.log("Issue created in Redmine:", result);
        res.status(200).send("Issue synced to Redmine");
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send("Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Webhook listener running on http://localhost:${PORT}/webhook`);
});
