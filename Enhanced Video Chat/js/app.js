/* global OT API_KEY TOKEN SESSION_ID SAMPLE_SERVER_BASE_URL */

let apiKey;
let sessionId;
let token;

function logError(type, error) {
  if (error) {
    console.error(`[${type}] Error (Code: ${error.code}): ${error.message}`);
  }
}

function handleError(error) {
  logError("General", error);
}

function handleSessionError(error) {
  logError("Session", error);
  // Additional session-specific error handling
}

function handleSubscribeError(error) {
  logError("Subscribe", error);
  // Additional subscribe-specific error handling
}

function handlePublisherError(error) {
  if (error) {
    logError("Publisher", error);

    if (error.code === 1500) {
      console.log("Attempting to retry publisher initialization...");
      retryInitPublisher(
        "publisher",
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
        },
        3, // Retry up to 3 times
        (publisher) => {
          console.log("Publisher reinitialized successfully.");
          session.publish(publisher, handlePublisherError);
        },
        (retryError) => {
          console.error(
            "Failed to recover from publisher error after retries:",
            retryError.message
          );
          alert(
            "Unable to establish a connection due to network issues. Please check your connection and try again."
          );
        }
      );
    } else {
      console.error("Unrecoverable publisher error:", error.message);
    }
  }
}

function retryInitPublisher(
  targetElement,
  publisherOptions,
  maxRetries,
  onSuccess,
  onError
) {
  let attempt = 0;

  function tryInitPublisher() {
    console.log(
      `Attempting to initialize publisher (Attempt ${attempt + 1})...`
    );

    const publisher = OT.initPublisher(
      targetElement,
      publisherOptions,
      (error) => {
        if (error) {
          console.error(`Publisher initialization failed: ${error.message}`);
          attempt++;

          if (attempt < maxRetries) {
            console.log("Retrying publisher initialization...");
            tryInitPublisher(); // Retry
          } else {
            console.error(
              "Max retries reached. Unable to initialize publisher."
            );
            if (onError) onError(error); // Call the error callback if provided
          }
        } else {
          console.log("Publisher initialized successfully.");
          if (onSuccess) onSuccess(publisher); // Call the success callback if provided
        }
      }
    );
  }

  tryInitPublisher();
}

// Global exception handler
OT.on("exception", (event) => {
  if (event.code === 1500) {
    console.warn("Global ICE Workflow Error detected:", event.message);
    // Do not retry here, as handlePublisherError already handles retries
    console.warn(
      "Network issues detected. Please check your connection and try again."
    );
  } else {
    logError("Global Exception", {
      code: event.code,
      message: event.message,
    });
    console.error("Exception Details:", event);
  }
});

// Simulate an exception when the button is clicked
document.getElementById("simulateException").addEventListener("click", () => {
  OT.trigger("exception", {
    code: 9999, // Custom error code
    message: "This is a simulated exception for testing purposes.",
  });
});

function initializeSession() {
  const session = OT.initSession(apiKey, sessionId);

  // Subscribe to a newly created stream
  session.on("streamCreated", (event) => {
    const subscriberOptions = {
      insertMode: "append",
      width: "100%",
      height: "100%",
    };
    session.subscribe(
      event.stream,
      "subscriber",
      subscriberOptions,
      handleSubscribeError
    );
  });

  session.on("connectionDestroyed", (event) => {
    console.warn("A connection was destroyed:", event.reason);
  });

  session.on("sessionDisconnected", (event) => {
    console.warn("You were disconnected from the session:", event.reason);
    if (event.reason === "networkDisconnected") {
      console.warn(
        "You were disconnected due to network issues. Please check your connection."
      );
    }
  });

  session.on("streamDestroyed", (event) => {
    console.warn("A stream was destroyed:", event.reason);
    if (event.reason === "networkDisconnected") {
      console.warn("A stream was lost due to network issues.");
    }
  });

  // Initialize the publisher
  const publisherOptions = {
    insertMode: "append",
    width: "100%",
    height: "100%",
  };

  retryInitPublisher(
    "publisher", // Target element ID
    publisherOptions,
    3, // Maximum retries
    (publisher) => {
      // Success callback: Publish the publisher to the session
      session.publish(publisher, handlePublisherError);
    },
    (error) => {
      // Error callback: Handle the failure
      console.error(
        "Failed to initialize the publisher after 3 attempts:",
        error.message
      );
      console.warn(
        "Unable to initialize the publisher. Please check your connection and try again."
      );
    }
  );

  // Connect to the session
  session.connect(token, (error) => {
    if (error) {
      handleSessionError(error);
    } else {
      console.log("Session connected successfully.");
      session.publish(publisher, handlePublisherError);
    }
  });
}

// See the config.js file.
if (API_KEY && TOKEN && SESSION_ID) {
  apiKey = API_KEY;
  sessionId = SESSION_ID;
  token = TOKEN;
  initializeSession();
} else if (SAMPLE_SERVER_BASE_URL) {
  // Make a GET request to get the OpenTok API key, session ID, and token from the server
  fetch(SAMPLE_SERVER_BASE_URL + "/session")
    .then((response) => response.json())
    .then((json) => {
      apiKey = json.apiKey;
      sessionId = json.sessionId;
      token = json.token;
      // Initialize an OpenTok Session object
      initializeSession();
    })
    .catch((error) => {
      handleError(error);
      console.log(
        "Failed to get opentok sessionId and token. Make sure you have updated the config.js file."
      );
    });
}

if (!OT.checkSystemRequirements()) {
  console.log(
    "Your browser does not support WebRTC. Please use a modern browser like Chrome or Firefox."
  );
}
