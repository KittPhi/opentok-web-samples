/* global OT API_KEY TOKEN SESSION_ID SAMPLE_SERVER_BASE_URL */

let apiKey;
let sessionId;
let token;
let session;
let isPublisherPublished = false; // Track if the publisher is successfully published
let publishAttempts = 0; // Track publish attempts
const MAX_PUBLISH_ATTEMPTS = 3; // Limit publish attempts

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

    if (publishAttempts < MAX_PUBLISH_ATTEMPTS) {
      publishAttempts++;
      console.log(
        `Retrying publisher initialization (Attempt ${publishAttempts})...`
      );
      retryInitPublisher(
        "publisher",
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
        },
        1, // Retry only once during re-publish
        (publisher) => {
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
      console.error("Max publish attempts reached. Unable to publish.");
      alert(
        "Unable to publish your stream. Please refresh the page and try again."
      );
    }
  } else {
    isPublisherPublished = true;
    console.log("Publisher successfully published to the session.");
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
    // console.error("Exception Details:", event);
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
  session = OT.initSession(apiKey, sessionId); // Initialize the session

  // Subscribe to a newly created stream
  session.on("streamCreated", (event) => {
    console.log("New stream created. Subscribing...");
    const subscriberOptions = {
      insertMode: "append",
      width: "100%",
      height: "100%",
    };

    // Create a unique container for the subscriber
    const subscriberContainer = document.createElement("div");
    subscriberContainer.id = `subscriber-${event.stream.streamId}`;
    document.getElementById("subscribers").appendChild(subscriberContainer);

    session.subscribe(
      event.stream,
      subscriberContainer.id,
      subscriberOptions,
      handleSubscribeError
    );
  });

  // Handle stream destruction
  session.on("streamDestroyed", (event) => {
    console.warn("A stream was destroyed:", event.reason);

    // Remove the corresponding subscriber container
    const subscriberContainer = document.getElementById(
      `subscriber-${event.stream.streamId}`
    );
    if (subscriberContainer) {
      subscriberContainer.remove();
    }

    if (event.reason === "networkDisconnected") {
      console.warn("A stream was lost due to network issues.");
    }
  });

  // Handle connection destruction
  session.on("connectionDestroyed", (event) => {
    console.warn("A connection was destroyed:", event.reason);
    // Optionally, notify other participants about the disconnection
  });

  // Handle session disconnection
  session.on("sessionDisconnected", (event) => {
    console.warn("You were disconnected from the session:", event.reason);

    // Clean up the publisher UI
    const publisherContainer = document.getElementById("publisher");
    if (publisherContainer) {
      publisherContainer.innerHTML = ""; // Clear the publisher container
    }

    if (event.reason === "networkDisconnected") {
      console.warn(
        "You were disconnected due to network issues. Attempting to reconnect..."
      );

      // Attempt to reconnect
      session.connect(token, (error) => {
        if (error) {
          console.error("Failed to reconnect to the session:", error.message);
        } else {
          console.log("Reconnected to the session successfully.");

          // Reinitialize and republish the publisher
          retryInitPublisher(
            "publisher",
            {
              insertMode: "append",
              width: "100%",
              height: "100%",
            },
            3, // Maximum retries
            (publisher) => {
              session.publish(publisher, handlePublisherError);
            },
            (error) => {
              console.error(
                "Failed to reinitialize the publisher after reconnection:",
                error.message
              );
            }
          );
        }
      });
    }
  });

  // Connect to the session
  session.connect(token, (error) => {
    if (error) {
      handleSessionError(error);
    } else {
      console.log("Session connected successfully.");

      // Initialize the publisher only after the session is connected
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
