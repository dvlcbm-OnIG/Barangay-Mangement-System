const createResourceModel = require("./resourceModel");

module.exports = createResourceModel(
  "announcements",
  ["announcement_id", "title", "content", "date_published"],
  "date_published DESC, id DESC"
);
