import express from "express";
import fetch from "node-fetch";
import { Project_map } from "./Project-map.js";
import { Priority_map } from "./Priority-map.js";

const app = express();
const PORT = 3000;
const API_KEY = "ee4ba70032f123cbb312201ae2de7089e32e587a";
const REDMINE_URL = "http://157.7.87.189";
const corsAnywhere = "https://cors-anywhere.herokuapp.com/";

app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    const issueData = data.content;
    console.log("data :>> ", data);
    console.log("issueData.changes :>> ", issueData.changes);

    if (!issueData || !issueData.summary) {
      return res.status(400).send("No valid issue data");
    }

    if (issueData.changes && issueData.changes.length > 0) {
      console.log("Change");
      const message = await editIssue(data);
      res.status(200).send(message);
    } else if (issueData.comment?.content?.length > 0) {
      console.log("Comment");
      const message = await addComment(data);
      res.status(200).send(message);
    } else {
      console.log("Create");
      const result = await createIssue(data);
      console.log("Issue created in Redmine:", result);
      res.status(200).send("Issue synced to Redmine");
    }
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).send("Server Error");
  }
});

async function createIssue(data) {
  const issueData = data.content;
  const subject = issueData.summary;
  const description = issueData.description || "Tạo từ Backlog";
  const projectId = Project_map[issueData.issueType.projectId]?.id || null;

  if (!projectId) {
    throw new Error("No valid project ID");
  }

  const redmineBody = {
    issue: {
      project_id: projectId,
      subject: `[${data.project.projectKey}-${issueData.key_id}] ${subject}`,
      description: description,
      tracker_id: ["Bug", "バグ"].includes(issueData.issueType.name) ? 1 : 2,
      status_id: 1,
      priority_id: Priority_map[issueData.priority.id],
      custom_fields: [
        {
          id: 10,
          value: issueData.id,
        },
      ],
      start_date: issueData.startDate,
      due_date: issueData.dueDate,
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
      subject: `[${data.project.projectKey}-${issueData.key_id}] ${issueData.summary}`,
      description: issueData.description,
      priority_id: Priority_map[issueData.priority.id],
      start_date: issueData.startDate,
      due_date: issueData.dueDate,
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

  if (response.status === 204) {
    console.log("Issue updated successfully (204 No Content)");
    return "Issue synced to Redmine (no content)";
  }

  const text = await response.text();

  if (!response.ok) {
    console.error("Redmine Error:", text);
    throw new Error(`Failed to edit Redmine issue: ${text}`);
  }

  try {
    const result = JSON.parse(text);
    console.log("Issue updated in Redmine:", result);
    return "Issue synced to Redmine";
  } catch (e) {
    console.warn("Không có JSON hợp lệ, nhưng request thành công.");
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

  console.log("JSON.stringify(redmineBody) :>> ", JSON.stringify(redmineBody));

  const response = await fetch(`${REDMINE_URL}/issues/${idRedmine}.json`, {
    method: "PUT",
    headers: {
      "X-Redmine-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(redmineBody),
  });

  if (response.status === 204) {
    console.log("Comment added successfully (204 No Content)");
    return "Comment synced to Redmine (no content)";
  }

  const text = await response.text();

  if (!response.ok) {
    console.error("Redmine Error:", text);
    throw new Error(`Failed to add comment to Redmine issue: ${text}`);
  }

  try {
    const result = JSON.parse(text);
    console.log("Issue updated in Redmine:", result);
    return "Comment synced to Redmine";
  } catch (e) {
    console.warn("Không có JSON hợp lệ, nhưng request thành công.");
    return "Comment synced to Redmine (no JSON returned)";
  }
}

async function getIdTaskOnRedmine(idTaskBacklog) {
  const url = `${corsAnywhere}${REDMINE_URL}/issues.json?cf_10=${idTaskBacklog}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Redmine-API-Key": API_KEY,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.issues[0]?.id || null;
  } catch (e) {
    console.error("Không thể parse JSON:", e);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`Webhook listener running on http://localhost:${PORT}/webhook`);
});
