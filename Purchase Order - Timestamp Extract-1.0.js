// ==UserScript==
// @name         Purchase Order - Timestamp Extract
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  See JSON data on Purchase order page
// @author       Etoooo
// @match        *://us.merchantos.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 500;
    let useFormattedDate = true;
    let orderDataCache = [];

    function showMessageBox(message, callback) {
        const messageBox = document.createElement('div');
        messageBox.style.position = 'fixed';
        messageBox.style.top = '50%';
        messageBox.style.left = '50%';
        messageBox.style.transform = 'translate(-50%, -50%)';
        messageBox.style.padding = '20px';
        messageBox.style.backgroundColor = '#fff';
        messageBox.style.border = '1px solid #ccc';
        messageBox.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)';
        messageBox.style.zIndex = 10000;
        messageBox.style.width = '300px';
        messageBox.style.textAlign = 'center';

        const messageText = document.createElement('div');
        messageText.innerText = message;
        messageText.style.marginBottom = '10px';
        messageBox.appendChild(messageText);

        const button = document.createElement('button');
        button.innerText = 'OK';
        button.onclick = function() {
            document.body.removeChild(messageBox);
            if (callback) callback();
        };
        messageBox.appendChild(button);

        document.body.appendChild(messageBox);
    }

    function checkPOPage() {
        const isPOPage = /\/Order\//.test(window.location.pathname);
        if (!isPOPage && !localStorage.getItem('poPageChecked')) {
            const message = `1. Please go to the PO page, then refresh.\n2. Set store & time range.\n3. Click "Extract Order Info" to start the extract.\n4. "Toggle Date Format" can be used to see raw JSON data.`;
            showMessageBox(message, function() {
                localStorage.setItem('poPageChecked', 'true');
                window.location.reload();
            });
        }
    }

    async function fetchOrderData(accountID, orderID) {
        const baseUrl = `https://${window.location.host}`;
        const url = `${baseUrl}/API/Account/${accountID}/Order/${orderID}.json?load_relations=all`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            return data.Order;
        } catch (error) {
            console.error(`Failed to fetch order data for order ID ${orderID}:`, error);
            return null;
        }
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function isOlderThan180Days(dateString) {
        const date = new Date(dateString);
        const today = new Date();
        const timeDiff = today - date;
        const dayDiff = timeDiff / (1000 * 60 * 60 * 24);
        return dayDiff > 180;
    }

    function updateRowData(row, orderData) {
        const createTime = useFormattedDate ? formatDate(orderData.createTime) : orderData.createTime;
        const orderedDate = useFormattedDate ? formatDate(orderData.createTime) : orderData.createTime;
        const receivedDate = useFormattedDate ? formatDate(orderData.Note.timeStamp) : orderData.Note.timeStamp;
        const timestamp = useFormattedDate ? formatDate(orderData.timeStamp) : orderData.timeStamp;

        row.cells[0].textContent = orderData.orderID;
        row.cells[5].textContent = createTime;
        row.cells[6].textContent = orderedDate;
        row.cells[7].textContent = receivedDate;
        row.cells[8].textContent = timestamp;

        if (isOlderThan180Days(orderData.createTime)) {
            row.style.backgroundColor = 'red'; // Highlight the row in red if older than 180 days
        } else {
            row.style.backgroundColor = 'lightgreen'; // Highlight the row in green if less than 180 days
        }
    }

    async function extractOrderInfo() {
        const accountID = document.querySelector('#help_account_id var')?.textContent.trim();
        const rows = Array.from(document.querySelectorAll('#listing_single tbody tr'));
        const progressBarContainer = document.getElementById('progress-bar-container');
        const progressBar = document.getElementById('progress-bar');
        if (!accountID || rows.length === 0) {
            console.error('Unable to find account ID or rows');
            return;
        }

        progressBarContainer.style.display = 'flex';
        progressBar.max = rows.length;
        orderDataCache = []; // Clear cache on new extraction

        let processedCount = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const fetchPromises = batch.map(async (row) => {
                const orderID = row.querySelector('td:first-child a')?.textContent.trim();
                if (!orderID) return;

                const orderData = await fetchOrderData(accountID, orderID);
                if (orderData) {
                    orderData.orderID = orderID; // Store order ID to use later in updateRowData
                    orderDataCache.push({ row, orderData }); // Cache the data
                    updateRowData(row, orderData);
                }

                processedCount++;
                progressBar.value = processedCount;
            });

            await Promise.all(fetchPromises);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }

        progressBarContainer.style.display = 'none';
    }

    function toggleDateFormat() {
        useFormattedDate = !useFormattedDate;
        orderDataCache.forEach(({ row, orderData }) => updateRowData(row, orderData));
    }

    function addButton() {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.top = '10px';
        buttonContainer.style.right = '10px';
        buttonContainer.style.zIndex = 1000;
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';

        const extractButton = document.createElement('button');
        extractButton.innerText = 'Extract Order Info';
        extractButton.onclick = extractOrderInfo;
        buttonContainer.appendChild(extractButton);

        const toggleButton = document.createElement('button');
        toggleButton.innerText = 'Toggle Date Format';
        toggleButton.onclick = toggleDateFormat;
        buttonContainer.appendChild(toggleButton);

        document.body.appendChild(buttonContainer);

        const progressBarContainer = document.createElement('div');
        progressBarContainer.id = 'progress-bar-container';
        progressBarContainer.style.position = 'fixed';
        progressBarContainer.style.top = '50%';
        progressBarContainer.style.left = '50%';
        progressBarContainer.style.transform = 'translate(-50%, -50%)';
        progressBarContainer.style.display = 'none';
        progressBarContainer.style.flexDirection = 'column';
        progressBarContainer.style.alignItems = 'center';
        progressBarContainer.style.padding = '20px';
        progressBarContainer.style.backgroundColor = '#f9f9f9';
        progressBarContainer.style.border = '1px solid #ccc';
        progressBarContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)';
        progressBarContainer.style.borderRadius = '8px';
        progressBarContainer.style.zIndex = 1000;

        const progressText = document.createElement('div');
        progressText.innerText = "Processing PO's";
        progressText.style.marginBottom = '10px';
        progressText.style.fontSize = '16px';
        progressText.style.fontWeight = 'bold';
        progressBarContainer.appendChild(progressText);

        const progressBar = document.createElement('progress');
        progressBar.id = 'progress-bar';
        progressBar.style.width = '200px';
        progressBar.style.height = '20px';
        progressBarContainer.appendChild(progressBar);

        document.body.appendChild(progressBarContainer);
    }

    function updateTableHeaders() {
        const headers = document.querySelectorAll('#listing_single thead th');
        if (headers.length >= 9) {
            headers[5].textContent = 'Create Time';
            headers[6].textContent = 'Ordered Date';
            headers[7].textContent = 'Received Date';
            headers[8].textContent = 'Timestamp';
        }
    }

    window.addEventListener('load', function() {
        checkPOPage();
        addButton();
        updateTableHeaders();
    });
})();