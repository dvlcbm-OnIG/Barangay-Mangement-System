const express = require("express");
const controller = require("../controllers/apiController");
const { requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

router.post("/login", controller.loginUser);
router.post("/logout", controller.logoutUser);
router.get("/session", requireAuth, controller.getCurrentUser);

router.use(requireAuth, requireAdmin);
router.post("/account", controller.createProfileAccount);
router.get("/dashboard", controller.showDashboard);

router.post("/resident", controller.createResident);
router.get("/resident", controller.showAllResidents);
router.patch("/resident/:id", controller.updateResident);
router.delete("/resident/:id", controller.deleteResident);

router.post("/document-request", controller.createDocumentRequest);
router.get("/document-request", controller.showAllDocumentRequests);
router.patch("/document-request/:id", controller.updateDocumentRequest);
router.delete("/document-request/:id", controller.deleteDocumentRequest);

router.post("/complaint", controller.createComplaint);
router.get("/complaint", controller.showAllComplaints);
router.patch("/complaint/:id", controller.updateComplaint);
router.delete("/complaint/:id", controller.deleteComplaint);

router.post("/official", controller.createOfficial);
router.get("/official", controller.showAllOfficials);
router.patch("/official/:id", controller.updateOfficial);
router.delete("/official/:id", controller.deleteOfficial);

router.post("/announcement", controller.createAnnouncement);
router.get("/announcement", controller.showAllAnnouncements);
router.patch("/announcement/:id", controller.updateAnnouncement);
router.delete("/announcement/:id", controller.deleteAnnouncement);

module.exports = router;
