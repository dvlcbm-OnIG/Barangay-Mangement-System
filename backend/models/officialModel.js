const createResourceModel = require("./resourceModel");

module.exports = createResourceModel(
  "officials",
  ["official_id", "full_name", "position", "term", "contact_number"]
);
