const detectDevice = (userAgent) => {
  if (!userAgent) return { deviceType: null, operatingSystem: null, browser: null };

  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(userAgent) ||
    (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
  const deviceType = isTablet
    ? "Tablet"
    : /Mobi|iPhone|iPod|Android.*Mobile/i.test(userAgent)
      ? "Mobile"
      : /Windows NT|Macintosh|X11|Linux x86_64|Linux i[3-6]86/i.test(userAgent)
        ? "Desktop"
        : null;

  let operatingSystem = null;
  if (/Windows NT/i.test(userAgent)) operatingSystem = "Windows";
  else if (/Android/i.test(userAgent)) operatingSystem = "Android";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) operatingSystem = "iOS";
  else if (/Mac OS X|Macintosh/i.test(userAgent)) operatingSystem = "macOS";
  else if (/Linux/i.test(userAgent)) operatingSystem = "Linux";

  let browser = null;
  if (/Edg\//i.test(userAgent)) browser = "Edge";
  else if (/OPR\//i.test(userAgent)) browser = "Opera";
  else if (/Firefox\/|FxiOS\//i.test(userAgent)) browser = "Firefox";
  else if (/CriOS\//i.test(userAgent)) browser = "Chrome";
  else if (/Chrome\//i.test(userAgent)) browser = "Chrome";
  else if (/Safari\//i.test(userAgent)) browser = "Safari";

  return { deviceType, operatingSystem, browser };
};

const getClientMetadata = (req) => {
  const userAgent = String(req.get("user-agent") || "").slice(0, 1024) || null;
  const { deviceType, operatingSystem, browser } = detectDevice(userAgent);
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent,
    deviceType,
    operatingSystem,
    browser,
  };
};

module.exports = { detectDevice, getClientMetadata };
