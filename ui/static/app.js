console.log(window);
Vue.component('json-viewer', window.JsonView.default);

new Vue({
    el: '#app',
    data: {
        logs: [],
        errors: [],
        socket: null,
        showForm: false,  // determines whether the form is shown or hidden
        newItems: "",  // holds the content of the textarea,
        items: [],
        currentPage: 1,
        itemsPerPage: 10,
        totalPages: 0,
        totalItems: 0,
        currentItem: {},
        fetchItemsInterval: null,
        lastRefreshAt: null,
        lastRefreshSecondsAgo: 0,
        lastRefreshFormatterInterval: null,
        loadingData: false,

        socketRetryCount: 0,
        maxSocketRetries: 5,
        socketRetryInterval: 5000
    },
    created() {
        this.connectWebSocket();
        this.fetchItems(this.currentPage);
        //this.resumeFetching();
        //this.lastRefreshFormatterInterval = setInterval(this.updateSecondsAgo, 1000);
    },
    beforeDestroy() {
        this.pauseFetching();  // Clear the interval when the component is destroyed
        clearInterval(this.lastRefreshFormatterInterval);
        this.lastRefreshFormatterInterval = null;
    },
    // add watcher to scrollToBottom() whenever logs or errors change
    watch: {
        logs() {
            this.scrollToBottom();
        },
        errors() {
            this.scrollToBottom();
        }
    },
    computed: {
        
        formattedLastRefreshAt() {
            return this.lastRefreshAt.toLocaleString();
        }
    
    },
    methods: {
        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.logsContainer;
                container.scrollTop = container.scrollHeight;
            });
        },

        fetchItemData(itemId) {
            // Set loadingDataFor for the current itemId to true
            this.loadingData = true;
        
            fetch(`/items/${itemId}/data`)
                .then(response => response.json())
                .then(data => {
                    // Find the item in the items array and update its data field
                    const item = this.items.find(i => i.id === itemId);
                    if (item) {
                        item.data = JSON.parse(data.data);
                        if (item.data.body) {
                            // encode html to prevent json viewer from breaking
                            item.data.body = item.data.body.substring(0, 500).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '...';
                            
                        }

                        item.logs = data.logs;
                    }
                })
                .catch(error => {
                    console.error("Error fetching item data:", error);
                    this.errors.push({ id: Date.now(), message: `Failed to fetch data for item with ID ${itemId}.` });
                })
                .finally(() => {
                    // Set loadingDataFor for the current itemId to false once loading is finished
                    this.loadingData = false;
                });
        },
        updateSecondsAgo() {
            const currentTime = Date.now();
            this.lastRefreshSecondsAgo = Math.floor((currentTime - this.lastRefreshAt) / 1000);
        },
        openModal(item) {
            this.currentItem = item;
            this.fetchItemData(item.id);
            const itemModal = new bootstrap.Modal(document.getElementById('itemModal'));
            itemModal.show();
        },
        connectWebSocket() {
            if (this.socketRetryCount >= this.maxSocketRetries) {
                console.error("Max reconnect attempts reached. Won't try again.");
                return;
            }
    
            this.socket = new WebSocket('ws://localhost:3020');
    
            this.socket.addEventListener('open', () => {
                console.log('WebSocket connected.');
                this.logs.push({ createdAt: Date.now(), message: 'WebSocket connected.' });
                this.socketRetryCount = 0; // reset retry count on successful connection
            });
    
            this.socket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                if (data.type == 'log_stderr') {
                    this.logs.push({ createdAt: Date.now(), message: data.data, severity: 'error' });
                    this.errors.push({ createdAt: Date.now(), message: data.data });
                }
                if (data.type == 'log_stdout') {
                    this.logs.push({ createdAt: Date.now(), message: data.data });
                }
                if (data.type == 'item_update') {
                    console.log('item_update', data);
                    let itemIdx = this.items.findIndex(i => i.id === data.data.id);
                    console.log('found item', itemIdx);
                    if (itemIdx !== -1) {
                        //item = data;
                        this.$set(this.items, itemIdx, data.data);
                    }
                }
            });
    
            this.socket.addEventListener('close', (event) => {
                console.log('WebSocket closed.', event);
                this.logs.push({ createdAt: Date.now(), message: `WebSocket closed. Reconnection attempt #${this.socketRetryCount+1}`, severity: 'error' });
                //this.errors.push({ id: Date.now(), message: `WebSocket closed. Reconnection attempt #${this.socketRetryCount+1}` });
                this.socketRetryCount++;
                setTimeout(() => this.connectWebSocket(), this.socketRetryInterval);
            });
    
            this.socket.addEventListener('error', (event) => {
                this.logs.push({ createdAt: Date.now(), message: `WebSocket error: ${event.toString()}`, severity: 'error' });
                console.error('WebSocket error:', event);
            });
        },
        startProcess() {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send('start_process');
            } else {
                this.logs.push({ createdAt: Date.now(), message: `WebSocket is not open. Can't send message.`, severity: 'error' });
                console.error("WebSocket is not open. Can't send message.");
            }
        },

        fetchItems(page) {
            fetch(`/items?page=${page}`)
                .then(response => response.json())
                .then(data => {
                    this.items = data.items;
                    this.totalPages = data.totalPages;
                    this.totalItems = data.totalItems;
                    this.lastRefreshAt = new Date();
                });
            
        },

        pauseFetching() {
            clearInterval(this.fetchItemsInterval);
            this.fetchItemsInterval = null;
        },

        resumeFetching() {
            if (!this.fetchItemsInterval) {  // Check to avoid setting multiple intervals
                this.fetchItemsInterval = setInterval(() => {
                    this.fetchItems(this.currentPage);
                }, 5000);
            }
        },

        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.fetchItems(page);
            }
        },

        stopProcess() {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send('stop_process');
            } else {
                console.error("WebSocket is not open. Can't send message.");
            }
        },
        submitItems() {
            // Split the textarea's content by newline to get individual items
            const items = this.newItems.split('\n').filter(item => item.trim() !== '');

            // Now, you can send these items to your server for insertion into the database
            fetch('/add-items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ items })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.logs.push({ createdAt: Date.now(), message: 'Items added successfully!' });
                    this.newItems = "";  // Clear the textarea
                    this.fetchItems(this.currentPage);
                } else {
                    this.errors.push({ createdAt: Date.now(), message: 'Failed to add items.' });
                }
            });
        }
    }
});
