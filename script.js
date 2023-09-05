async function callOpenAI(apiKey, messageContent) {
    let response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{
                role: 'user',
                content: messageContent
            }],
            temperature: 0.7
        })
    });

    let data = await response.json();
    return data.choices[0].message.content.trim();
}

// Initialize an array to keep track of all units and pipes
let units = [];
let pipes = [];
let unitCounter = 0; // Counter to generate unique IDs for units
let currentPipe = null;
let tempLine = null;

// DOM Elements
const pipeCanvas = document.getElementById('pipeCanvas');
const canvas = document.getElementById('dragDropContainer');

// Graph data structure
let graph = {
    nodes: {},  // Store nodes (units) by their unique IDs
    edges: []  // Store edges (pipes)
};

// Function to add a node (unit) to the graph
function addNode(unit) {
    console.log(unit.dataset.type)
    graph.nodes[unit.id] = {
        id: unit.id,
        type: unit.dataset.type,
        x: unit.style.left,
        y: unit.style.top,
        data: [],  // to store incoming data
        readyCount: 0  // to keep track of readiness
    };
}

// Function to delete a node (unit) from the graph
function deleteNode(unitId) {
    // Remove the node from the 'nodes' object
    delete graph.nodes[unitId];

    // Remove any edges associated with this node
    graph.edges = graph.edges.filter(edge => {
        return edge.source !== unitId && edge.target !== unitId;
    });

    console.log(`Node with ID ${unitId} and its associated edges have been expunged.`);
}
// Function to add an edge (pipe) to the graph
function addEdge(pipe) {
    const edge = {
        from: pipe.outPort.parentElement.parentElement.id, // ID of the originating unit
        to: pipe.inPort.parentElement.parentElement.id  // ID of the destination unit
    };
    graph.edges.push(edge);
    graph.nodes[edge.to].readyCount++;  // Increment the readyCount for destination node
}

let visited = new Set();
let stack = [];

function topologicalSort(nodeId, graph) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const outgoingEdges = graph.edges.filter(edge => edge.from === nodeId);
    for (let edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
            topologicalSort(edge.to, graph);
        }
    }
  
    stack.push(nodeId);
}

let continuePipeline = true;
document.getElementById("stopButton").addEventListener("click", function() {
    continuePipeline = false;
});



function hasCycleDFS(nodeId, graph, state) {
    if (state[nodeId] === 'visiting') {
        return true; // Cycle detected
    }

    if (state[nodeId] === 'visited') {
        return false; // Already visited, no cycle from this node
    }

    state[nodeId] = 'visiting';

    const outgoingEdges = graph.edges.filter(edge => edge.from === nodeId);
    for (let edge of outgoingEdges) {
        if (hasCycleDFS(edge.to, graph, state)) {
            return true;
        }
    }

    state[nodeId] = 'visited';
    return false;
}

function hasCycle(graph) {
    let state = {};
    for (const nodeId in graph.nodes) {
        state[nodeId] = 'unvisited';
    }

    for (const nodeId in graph.nodes) {
        if (state[nodeId] === 'unvisited') {
            if (hasCycleDFS(nodeId, graph, state)) {
                return true;
            }
        }
    }

    return false;
}






document.getElementById("runButton").addEventListener("click",async function() {
    continuePipeline = true;
    // Reset data and readyCount for each node
    for (const nodeId in graph.nodes) {
        const node = graph.nodes[nodeId];
        node.data = [];
        node.readyCount = graph.edges.filter(edge => edge.to === nodeId).length;
	node.level = node.readyCount === 0 ? 0 : -1;  // Initialize level
    }
    if (hasCycle(graph)) {
        alert("Cycle detected. Handling it differently.");

        let currentLevel = 0;
        while (continuePipeline) {
            let nodesAtCurrentLevel = Object.values(graph.nodes).filter(node => node.level === currentLevel);
            if (nodesAtCurrentLevel.length === 0) {
                break;  // Stop if no nodes are at the current level
            }

            for (const node of nodesAtCurrentLevel) {
                await processData(node);  // Assuming processData is an async function
            }

            // Update levels for adjacent nodes
            for (const node of nodesAtCurrentLevel) {
                const outgoingEdges = graph.edges.filter(edge => edge.from === node.id);
                outgoingEdges.forEach(edge => {
                    const targetNode = graph.nodes[edge.to];
                    targetNode.readyCount--;
                    if (targetNode.readyCount === 0) {
                        targetNode.level = currentLevel + 1;
                    }
                });
            }

            currentLevel++;
        }

    } else {
    // Perform the topological sort
    visited = new Set();
    stack = [];
    for (const nodeId in graph.nodes) {
        if (!visited.has(nodeId)) {
            topologicalSort(nodeId, graph);
        }
    }

    // Process data for all nodes in sorted order
    while (stack.length > 0 && continuePipeline) {
        const nodeId = stack.pop();
        const node = graph.nodes[nodeId];
        await processData(node);
    }}
});

function transmitData(node, optionalData = null) {
    console.log("Inside transmitData for node:", node.id);
    let dataToSend = optionalData;
    if (dataToSend === null) {
        const textArea = document.getElementById(node.id).querySelector('textarea');
        console.log("Text area element:", textArea);
        dataToSend = textArea.value;
    }
    console.log("Actual data being sent:", dataToSend);

    const outgoingEdges = graph.edges.filter(edge => edge.from === node.id);
    console.log("Outgoing edges:", outgoingEdges);

    outgoingEdges.forEach(edge => {
        const targetNode = graph.nodes[edge.to];
        console.log("Sending data to target node:", targetNode.id);

        console.log("readyCount before:", targetNode.readyCount);
        targetNode.data.push({ source: node.id, value: dataToSend });
        targetNode.readyCount--;

        console.log("readyCount after:", targetNode.readyCount);

        if (targetNode.readyCount === 0) {
            console.log("All data received for target node:", targetNode.id, ". Initiating processing.");
            // No promise resolution needed here
        }
    });
}


async function processData(node) {
    console.log("Processing data for node:", node.id, "of type:", node.type);

    const nodeElement = document.getElementById(node.id);
    if (nodeElement) {
        const textArea = nodeElement.querySelector('textarea');
        if (textArea) {
            console.log("Text area element:", textArea);

            if (node.type === 'input') {
                processInput(node);
            } else if (node.type === 'output') {
                processOutput(node);
            } else if (node.type === 'openai') {
        	await processOpenAIUnit(node);  // This function should be async
    	    } else if (node.type === 'custom') {
        	processCustomUnit(node);
            }
	    
        } else {
            console.log("No text area found for node:", node.id);
        }
    } else {
        console.log("No element found for node:", node.id);
    }
}



function processInput(node) {
    console.log("Processing data for input unit:", node.id);
    const incomingEdges = graph.edges.filter(edge => edge.to === node.id);
    
    if (incomingEdges.length > 0) {
        const textArea = document.getElementById(node.id).querySelector('textarea');
        // Assume that you want to concatenate all incoming data with newlines
        textArea.value = node.data.map(d => d.value).join("\n");
    }
    
    transmitData(node);
}

function processOutput(node) {
    console.log("Processing data for output unit:", node.id);
    const textArea = document.getElementById(node.id).querySelector('textarea');
    if (node.data.length > 0) {
    	textArea.value = node.data.map(d => d.value).join("\n");
    }
    transmitData(node);
}

async function processOpenAIUnit(node) {
    console.log("Processing data for OpenAI unit:", node.id);
    const apiKey = document.getElementById("apiKey").value;
    const textArea = document.getElementById(node.id).querySelector('textarea');
    const prompt = textArea.value;

    let processedPrompt = prompt;
    node.data.forEach(d => {
        const match = d.source.match(/unit-(\w+)-(\d+)/);
        if (match) {
            const type = match[1];
            const number = match[2];
            const userFriendlyName = `${type}${number}`;
            console.log("Replacing placeholder:", userFriendlyName, "with value:", d.value);
            
            // Use a simple string replace here
            processedPrompt = processedPrompt.split(userFriendlyName).join(d.value);
        }
    });

    console.log("Processed prompt:", processedPrompt);

    // Make the API call
    const apiResponse = await callOpenAI(apiKey, processedPrompt);

    // Transmit data
    transmitData(node, apiResponse);
}

function processCustomUnit(node) {
    console.log("Processing data for Custom unit:", node.id);

    const textArea = document.getElementById(node.id).querySelector('textarea');
    let customCode = textArea.value;

    // Prepare a mapping for incoming data
    let inputData = {};
    node.data.forEach(d => {
        const match = d.source.match(/unit-(\w+)-(\d+)/);
        if (match) {
            const type = match[1];
            const number = match[2];
            const userFriendlyName = `${type}${number}`;
            inputData[userFriendlyName] = d.value;
        }
    });

    // Execute custom code
    let outputData;
    try {
        let customFunction = new Function('inputData', customCode);
	//example usage: return inputData['input1']
        outputData = customFunction(inputData);
        if (typeof outputData !== 'string') {
            outputData = String(outputData); // Convert to string if not already
        }
    } catch (error) {
        console.error("An error occurred while running custom code:", error);
        outputData = "Error";
    }

    // Transmit data
    transmitData(node, outputData);
}











// Function to delete an edge (pipe) from the graph
function deleteEdge(pipe) {
    // Find the edge to delete
    const edgeToDelete = graph.edges.find(edge => 
        edge.from === pipe.outPort.parentElement.parentElement.id &&
        edge.to === pipe.inPort.parentElement.parentElement.id
    );

    if (edgeToDelete) {
        // Decrease the readyCount for the target node
        const targetNodeId = edgeToDelete.to;
        if (graph.nodes[targetNodeId]) {
            graph.nodes[targetNodeId].readyCount--;
        }
        
        // Remove the edge
        graph.edges = graph.edges.filter(edge => edge !== edgeToDelete);
    }
}

// Function to update pipe positions
function updatePipes() {
    for (const pipe of pipes) {
        const outRect = pipe.outPort.getBoundingClientRect();
        const inRect = pipe.inPort.getBoundingClientRect();

        pipe.line.setAttribute('x1', outRect.left + outRect.width / 2);
        pipe.line.setAttribute('y1', outRect.top + outRect.height / 2);
        pipe.line.setAttribute('x2', inRect.left + inRect.width / 2);
        pipe.line.setAttribute('y2', inRect.top + inRect.height / 2);

        // Update delete text position
        const midX = (outRect.left + inRect.left) / 2;
        const midY = (outRect.top + inRect.top) / 2;
        pipe.deleteText.setAttribute('x', midX);
        pipe.deleteText.setAttribute('y', midY);
    }
}

// Function to delete a pipe
function deletePipe(pipe) {
    pipe.line.remove();
    pipe.deleteText.remove();
    const index = pipes.indexOf(pipe);
    if (index > -1) {
        pipes.splice(index, 1);
    }
    // Delete edge from graph
    deleteEdge(pipe);
}

// Function to delete pipes associated with a specific port
function deleteAssociatedPipes(port) {
    const associatedPipes = pipes.filter(pipe => pipe.inPort === port || pipe.outPort === port);
    for (const pipe of associatedPipes) {
        deletePipe(pipe);
    }
}

// Function to draw a pipe between two ports
function drawPipe(outPort, inPort) {
    const outRect = outPort.getBoundingClientRect();
    const inRect = inPort.getBoundingClientRect();

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const deleteText = document.createElementNS('http://www.w3.org/2000/svg', 'text');

    line.setAttribute('x1', outRect.left + outRect.width / 2);
    line.setAttribute('y1', outRect.top + outRect.height / 2);
    line.setAttribute('x2', inRect.left + inRect.width / 2);
    line.setAttribute('y2', inRect.top + inRect.height / 2);
    line.setAttribute('stroke', 'black');
    line.setAttribute('stroke-width', 2);
    line.classList.add('pipe');

    const midX = (outRect.left + inRect.left) / 2;
    const midY = (outRect.top + inRect.top) / 2;
    deleteText.setAttribute('x', midX);
    deleteText.setAttribute('y', midY);
    deleteText.textContent = 'Delete';
    deleteText.classList.add('delete-text');

    pipeCanvas.appendChild(line);
    pipeCanvas.appendChild(deleteText);

    const newPipe = { outPort, inPort, line, deleteText };
    pipes.push(newPipe);

    // Add edge to graph
    addEdge(newPipe);

    // Attach delete event to the deleteText
    deleteText.addEventListener('click', function() {
	console.log("Delete button clicked");
        deletePipe(newPipe);
    });

    return newPipe;
}
// Function to read uploaded file and display its content in a textarea
function handleFileUpload(event, textArea) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        textArea.value = e.target.result;
    };
    reader.readAsText(file);
}

const unitTypeCounters = {
    input: 0,
    openai: 0,
    custom: 0,
    output: 0
};

// Function to create a new draggable unit
function createUnit(unitType, x, y, id = null) {
    unitTypeCounters[unitType]++;

    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.style.left = `${x}px`;
    unit.style.top = `${y}px`;
    unit.id = id || `unit-${unitType}-${unitTypeCounters[unitType]}`;  // Append counter to ID
    unit.dataset.type = unitType;

    const handle = document.createElement('div');
    const inPort = document.createElement('div');
    const outPort = document.createElement('div');
    const textArea = document.createElement('textarea');
    const deleteButton = document.createElement('button');

    handle.className = 'handle';
    inPort.className = 'in-port port';
    outPort.className = 'out-port port';
    deleteButton.innerHTML = 'Delete';

    // Create text with unique identifier and append to handle
    const handleText = document.createTextNode(`${unitType}${unitTypeCounters[unitType]}`);
    handle.appendChild(handleText);


    handle.appendChild(inPort);
    
    handle.appendChild(outPort);
    unit.appendChild(handle);
    unit.appendChild(textArea);
    unit.appendChild(deleteButton);


    if (unitType === 'input') {
        // Add File Upload Button for 'input' units
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.addEventListener('change', function(event) {
            handleFileUpload(event, textArea);
        });
        unit.appendChild(fileInput);
    } else if (unitType === 'openai') {
        // Code for 'openai' units (if needed)
    } else if (unitType === 'custom') {
        // Code for 'custom' units (if needed)
    } else if (unitType === 'output') {
        // Code for 'output' units (if needed)
    }




    units.push(unit);
    canvas.appendChild(unit);
	
    // Add node to graph
    addNode(unit);

    handle.addEventListener('dragstart', function(event) {
        const rect = unit.getBoundingClientRect();
        event.dataTransfer.setData('text/plain', JSON.stringify({
            type: unitType,
            id: unit.id,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        }));
    });

    handle.addEventListener('dragend', updatePipes);

    inPort.addEventListener('mouseup', function(event) {
        if (currentPipe) {
            currentPipe.inPort = inPort;
            drawPipe(currentPipe.outPort, currentPipe.inPort);
            currentPipe = null;
        }
        if (tempLine) {
            tempLine.remove();
            tempLine = null;
        }
    });

    outPort.addEventListener('mousedown', function(event) {
        const rect = outPort.getBoundingClientRect();
        tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tempLine.setAttribute('x1', rect.left + rect.width / 2);
        tempLine.setAttribute('y1', rect.top + rect.height / 2);
        tempLine.setAttribute('x2', event.clientX);
        tempLine.setAttribute('y2', event.clientY);
        tempLine.setAttribute('stroke', 'black');
        tempLine.setAttribute('stroke-width', 2);
        pipeCanvas.appendChild(tempLine);
        currentPipe = { outPort: outPort };
    });

    deleteButton.addEventListener('click', function() {
        deleteAssociatedPipes(inPort);
        deleteAssociatedPipes(outPort);
	deleteNode(unit.id)
        unit.remove();
	
        const index = units.indexOf(unit);
        if (index > -1) {
            units.splice(index, 1);
        }
    });
}

// Initialize some units for testing

createUnit('input', 200, 300);
createUnit('output', 1200, 300);
createUnit('openai', 700, 300);

// Event Listeners for Drag and Drop and Mouse Movements
document.addEventListener('dragover', function(event) {
    event.preventDefault();
});

document.addEventListener('drop', function(event) {
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData('text'));
    if (data && data.type) {
        if (data.id) {
            const unit = document.getElementById(data.id);
            if (unit) {
                unit.style.left = `${event.clientX - data.x}px`;
                unit.style.top = `${event.clientY - data.y}px`;
            }
        } else {
            createUnit(data.type, event.clientX - data.x, event.clientY - data.y);
        }
    }
    updatePipes();
});

document.addEventListener('mousemove', function(event) {
    if (tempLine) {
        tempLine.setAttribute('x2', event.clientX);
        tempLine.setAttribute('y2', event.clientY);
    }
});

document.addEventListener('mouseup', function(event) {
    if (tempLine && !currentPipe) {
        tempLine.remove();
        tempLine = null;
    }
});
// Add click event listeners to the h2 elements for creating units
document.querySelectorAll('h2').forEach((header) => {
    header.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevent event from bubbling up
        createUnit(header.innerText.toLowerCase(), 100, 100);
    });
});





function generateFunctionCode() {
    let functionCode = `async function generatedFunction(inputs) {\n`;
    functionCode += `  let inputData = {};\n`;
    let outputVars = [];
    let inputMap = {};  // To map user-referenced keys to internal keys

    // Perform the topological sort and loop through nodes in stack to add processing logic
    visited = new Set();
    stack = [];
    for (const nodeId in graph.nodes) {
        if (!visited.has(nodeId)) {
            topologicalSort(nodeId, graph);
        }
    }
    stack.reverse();

    stack.forEach(nodeId => {
        const node = graph.nodes[nodeId];
        switch (node.type) {
            case 'input':
                inputMap[node.id.replace(/^unit-/, '')] = node.id;  // Create a map from user-referenced key to internal key
                functionCode += `  inputData['${node.id}'] = inputs['${node.id}'];\n`;
                break;
            case 'output':
                outputVars.push(node.id);
                break;
            case 'openai':
                let prompt = document.getElementById(node.id).querySelector('textarea').value;
                // Replace user-referenced keys with internal keys
                for (const userKey in inputMap) {
                    const internalKey = inputMap[userKey];
                    const regex = new RegExp(`\\b${userKey}\\b`, 'g');  // Match whole word
                    prompt = prompt.replace(regex, `${internalKey}`);
                }
                functionCode += `  // OpenAI API call simulated here\n`;
                functionCode += `  let ${node.id.replace(/-/g, '_')} = callOpenAI("${prompt.replace(/"/g, '\\"')}");\n`;
                functionCode += `  inputData['${node.id}'] = ${node.id.replace(/-/g, '_')};\n`;
                break;

            case 'custom':
                let customCode = document.getElementById(node.id).querySelector('textarea').value;
                // Replace user-referenced keys with internal keys
                for (const userKey in inputMap) {
                    const internalKey = inputMap[userKey];
                    const regex = new RegExp(`inputData\\['${userKey}'\\]`, 'g');
                    customCode = customCode.replace(regex, `inputData['${internalKey}']`);
                }
                functionCode += `  // Custom node logic\n`;
                functionCode += `  let ${node.id.replace(/-/g, '_')} = (function() { ${customCode} })();\n`;
                functionCode += `  inputData['${node.id}'] = ${node.id.replace(/-/g, '_')};\n`;
                break;
        }
    });

    if (outputVars.length > 0) {
        functionCode += `  return { ${outputVars.map(v => `'${v}': inputData['${v}']`).join(', ')} };\n`;
    }

    functionCode += '}\n';
    return functionCode;
}




// Download function
function downloadFunctionCode(functionCode) {
    const blob = new Blob([functionCode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'generatedFunction.js';
    a.click();
}

// Event listener for the button
document.getElementById('downloadFunctionButton').addEventListener('click', function() {
    const functionCode = generateFunctionCode();
    downloadFunctionCode(functionCode);
});
