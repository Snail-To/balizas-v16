/**
 * Módulo para interactuar con la API de la DGT
 * Carga las balizas V16 procesadas por el backend
 */

window.DgtApi = {
    inFlightRequest: null,

    // Configuración
    config: {
        FEED_URL: '/api/dgt-feed',
        REQUEST_TIMEOUT: 15000 // 15 segundos
    },

    /**
     * Carga las balizas procesadas por el proxy de la aplicación
     * @returns {Promise<Array>} Array de objetos con datos de balizas
     */
    async fetchData() {
        console.log('Cargando datos desde el proxy DGT de la aplicación...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

        let response;
        try {
            response = await fetch(this.config.FEED_URL, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
        } catch (error) {
            if (error && error.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const beacons = await response.json();
        if (!Array.isArray(beacons)) {
            throw new Error('Respuesta de datos no válida');
        }

        console.log(`Balizas recibidas: ${beacons.length}`);
        return beacons;
    },

    /**
     * Carga las balizas reutilizando cualquier petición aún en curso
     * @returns {Promise<Array>} Array de objetos con datos de balizas
     */
    getBeacons() {
        if (!this.inFlightRequest) {
            this.inFlightRequest = this.fetchData()
                .catch((error) => {
                    console.error('Error al obtener balizas:', error);
                    throw error;
                })
                .finally(() => {
                    this.inFlightRequest = null;
                });
        }

        return this.inFlightRequest;
    }
};

// Exportar para uso como módulo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.DgtApi;
}
