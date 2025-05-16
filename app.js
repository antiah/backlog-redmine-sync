import express from "express";
import fetch from "node-fetch";
import { Project_map } from "./Project-map.js";
import { Priority_map } from "./Priority-map.js";


const app = express();
app.use(express.json());

const API_KEY = "ee4ba70032f123cbb312201ae2de7089e32e587a";
const REDMINE_URL = "http://157.7.87.189";

app.post("/webhook", async (req, res) => {
    try {
        const data = req.body;
        const issueData = data.content;
        console.log("data :>> ", data);

        if (!issueData || !issueData.summary) {
            return res.status(400).send("No valid issue data");
        }

        if (issueData.changes && issueData.changes.length > 0) {
            console.log("data :>> ",issueData.changes);
            const message = await editIssue(data);
            res.status(200).send(message);
        } else if (issueData.comment?.content?.length > 0) {
            const message = await addComment(data);
            res.status(200).send(message);
        } else {
            const result = await createIssue(data);
            res.status(200).send("Issue synced to Redmine");
        }
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send("Server Error");
    }
});

export default app;

// Các hàm xử lý bên dưới
async function createIssue(data) {
    const issueData = data.content;
    const subject = issueData.summary;
    const description = issueData.description || "Tạo từ Backlog";
    const projectId = Project_map[issueData.issueType.projectId]?.id || null;

    if (!projectId) throw new Error("No valid project ID");
    let uploads = [];
    if (issueData.attachments?.length > 0) {
        for (const attachment of issueData.attachments) {
            console.log('attachment :>> ', attachment);
            const upload = await uploadFileToRedmine(
                attachment.url, // URL lấy file (phải là link public hoặc kèm token)
                attachment.name, // Tên file
                attachment.contentType || "application/octet-stream"
            );
            uploads.push(upload);
        }
    }

    const redmineBody = {
        issue: {
            project_id: projectId,
            subject: `[${data.project.projectKey}-${issueData.key_id}] ${subject}`,
            description,
            tracker_id: ["Bug", "バグ"].includes(issueData.issueType.name) ? 1 : 2,
            status_id: 1,
            priority_id: Priority_map[issueData.priority.id],
            custom_fields: [{ id: 10, value: issueData.id }],
            start_date: issueData.startDate,
            due_date: issueData.dueDate,
            uploads: uploads,
        },
    };

    const response = await fetch(`${REDMINE_URL}/issues.json`, {
        method: "POST",
        headers: {
            "X-Redmine-API-Key": API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(redmineBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create Redmine issue: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
}

async function editIssue(data) {
    const issueData = data.content;
    const idRedmine = await getIdTaskOnRedmine(issueData.id);
    if (!idRedmine) throw new Error("Redmine issue ID not found");

    const redmineBody = {
        issue: {
            // subject: `[${data.project.projectKey}-${issueData.key_id}] ${issueData.summary}`,
            // description: issueData.description,
            // priority_id: Priority_map[issueData.priority.id],
            // start_date: issueData.startDate,
            // due_date: issueData.dueDate,
        },
    };
    issueData.changes.forEach((change) => {
        switch (change.field) {
            case "summary":
                redmineBody.issue.subject = `[${data.project.projectKey}-${issueData.key_id}] ${change.new_value}`;
                break;
            case "description":
                redmineBody.issue.description = change.new_value;
                break;
            case "priority":
                redmineBody.issue.priority_id = Priority_map[change.new_value];
                break;
            case "startDate":
                redmineBody.issue.start_date = change.new_value;
                break;
            case "dueDate":
                redmineBody.issue.due_date = change.new_value;
                break;
            // case "uploads":
            //     redmineBody.issue.uploads = uploads;
            //     break;
            default:
                break;
        }
    })
    const response = await fetch(`${REDMINE_URL}/issues/${idRedmine}.json`, {
        method: "PUT",
        headers: {
            "X-Redmine-API-Key": API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(redmineBody),
    });

    if (response.status === 204) return "Issue synced to Redmine (no content)";
    const text = await response.text();
    if (!response.ok) throw new Error(`Failed to edit Redmine issue: ${text}`);

    try {
        JSON.parse(text);
        return "Issue synced to Redmine";
    } catch {
        return "Issue synced to Redmine (no JSON returned)";
    }
}

async function addComment(data) {
    const issueData = data.content;
    const idRedmine = await getIdTaskOnRedmine(issueData.id);
    if (!idRedmine) throw new Error("Redmine issue ID not found");

    const redmineBody = {
        issue: {
            notes: issueData.comment.content,
        },
    };

    const response = await fetch(`${REDMINE_URL}/issues/${idRedmine}.json`, {
        method: "PUT",
        headers: {
            "X-Redmine-API-Key": API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(redmineBody),
    });

    if (response.status === 204) return "Comment synced to Redmine (no content)";
    const text = await response.text();
    if (!response.ok) throw new Error(`Failed to add comment: ${text}`);

    try {
        JSON.parse(text);
        return "Comment synced to Redmine";
    } catch {
        return "Comment synced to Redmine (no JSON returned)";
    }
}

async function getIdTaskOnRedmine(idTaskBacklog) {
    const url = `${REDMINE_URL}/issues.json?cf_10=${idTaskBacklog}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "X-Redmine-API-Key": API_KEY,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
        },
    });

    try {
        const data = await response.json();
        return data.issues[0]?.id || null;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return null;
    }
}

async function uploadFileToRedmine(fileUrl, fileName, contentType) {
    const fileResponse = await fetch(fileUrl);
    const buffer = await fileResponse.arrayBuffer();

    const response = await fetch(`${REDMINE_URL}/uploads.json`, {
        method: "POST",
        headers: {
            "X-Redmine-API-Key": API_KEY,
            "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(buffer),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${text}`);
    }

    const json = await response.json();
    return {
        token: json.upload.token,
        filename: fileName,
        content_type: contentType,
    };
}
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Webhook listener running on http://localhost:${PORT}/webhook`);
});
