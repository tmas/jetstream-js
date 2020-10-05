import {
    guardAgainstReservedFieldName,
    isArray,
    isFile,
    merge,
    objectToFormData,
    reservedFieldNames
} from './util';

class InertiaForm {
    constructor(data = {}, options = {}) {
        this.processing = false;
        this.successful = false;
        this.recentlySuccessful = false;
        this.isDirty = false;

        this.withData(data)
            .withOptions(options)

        return new Proxy(this, {
            set(obj, prop, value) {
                obj[prop] = value;

                if ((reservedFieldNames.indexOf(prop) === -1) && value !== obj.initial[prop]) {
                    obj.isDirty = true;
                }

                return true;
            }
        })
    }

    static create(data = {}) {
        return new InertiaForm().withData(data);
    }

    withData(data) {
        if (isArray(data)) {
            data = data.reduce((carry, element) => {
                carry[element] = '';
                return carry;
            }, {});
        }

        this.setInitialValues(data);

        this.processing = false;
        this.successful = false;

        for (const field in data) {
            guardAgainstReservedFieldName(field);

            this[field] = data[field];
        }

        this.isDirty = false;

        return this;
    }

    withOptions(options) {
        this.__options = {
            bag: 'default',
            resetOnSuccess: true,
            setInitialOnSuccess: false,
        };

        if (options.hasOwnProperty('bag')) {
            this.__options.bag = options.bag;
        }

        if (options.hasOwnProperty('resetOnSuccess')) {
            this.__options.resetOnSuccess = options.resetOnSuccess;
        }

        if (options.hasOwnProperty('setInitialOnSuccess')) {
            this.__options.setInitialOnSuccess = options.setInitialOnSuccess;
        }

        return this;
    }

    withInertia(inertia) {
        this.__inertia = inertia;

        return this;
    }

    withPage(page) {
        this.__page = page;

        return this;
    }

    data() {
        const data = {
            '_error_bag': this.__options.bag
        };

        for (const property in this.initial) {
            data[property] = this[property];
        }

        return data;
    }

    reset() {
        merge(this, this.initial);

        this.isDirty = false;
    }

    setInitialValues(values) {
        this.initial = {};

        merge(this.initial, values);
    }

    post(url, options = {}) {
        return this.submit('post', url, options);
    }

    put(url, options = {}) {
        return this.submit('put', url, options);
    }

    patch(url, options = {}) {
        return this.submit('patch', url, options);
    }

    delete(url, options) {
        return this.submit('delete', url, options);
    }

    submit(requestType, url, options) {
        this.__validateRequestType(requestType);

        this.processing = true;
        this.successful = false;

        const then = () => {
            this.processing = false;

            if (! this.hasErrors()) {
                this.onSuccess();
            } else {
                this.onFail();
            }
        }

        if (requestType === 'delete') {
            return this.__inertia[requestType](url, options)
                .then(then)
        }

        return this.__inertia[requestType](url, this.hasFiles() ? objectToFormData(this.data()) : this.data(), options)
            .then(then)
    }

    hasFiles() {
        for (const property in this.initial) {
            if (this.hasFilesDeep(this[property])) {
                return true;
            }
        }

        return false;
    };

    hasFilesDeep(object) {
        if (object === null) {
            return false;
        }

        if (typeof object === 'object') {
            for (const key in object) {
                if (object.hasOwnProperty(key)) {
                    if (this.hasFilesDeep(object[key])) {
                        return true;
                    }
                }
            }
        }

        if (Array.isArray(object)) {
            for (const key in object) {
                if (object.hasOwnProperty(key)) {
                    return this.hasFilesDeep(object[key]);
                }
            }
        }

        return isFile(object);
    }

    onSuccess() {
        this.successful = true;
        this.recentlySuccessful = true;

        setTimeout(() => this.recentlySuccessful = false, 2000);

        if (this.__options.resetOnSuccess) {
            this.reset();
        } else if (this.__options.setInitialOnSuccess) {
            const { _error_bag, ...data } = this.data();
            this.setInitialValues(data);
            this.isDirty = false;
        }
    }

    onFail() {
        this.successful = false;
        this.recentlySuccessful = false;
    }

    hasErrors() {
        return this.inertiaPage().errorBags[this.__options.bag] &&
               Object.keys(this.inertiaPage().errorBags[this.__options.bag]).length > 0;
    }

    error(field) {
        if (! this.hasErrors() ||
            ! this.inertiaPage().errorBags[this.__options.bag][field] ||
            this.inertiaPage().errorBags[this.__options.bag][field].length == 0) {
            return;
        }

        return this.inertiaPage().errorBags[this.__options.bag][field][0];
    }

    errors(field = null) {
        if (field === null) {
            return this.hasErrors()
                        ? Object.values(this.inertiaPage().errorBags[this.__options.bag])
                                .reduce((a, b) => a.concat(b), [])
                        : [];
        }

        return this.error(field)
                    ? this.inertiaPage().errorBags[this.__options.bag][field]
                    : [];
    }

    inertiaPage() {
        return this.__page()
    }

    __validateRequestType(requestType) {
        const requestTypes = ['get', 'post', 'put', 'patch', 'delete'];

        if (requestTypes.indexOf(requestType) === -1) {
            throw new Error(
                `\`${requestType}\` is not a valid request type, ` +
                    `must be one of: \`${requestTypes.join('`, `')}\`.`
            );
        }
    }
}

export default {
    install(Vue) {
        Vue.prototype.$inertia.form = (data = {}, options = {}) => {
            return InertiaForm.create()
                        .withData(data)
                        .withOptions(options)
                        .withInertia(Vue.prototype.$inertia)
                        .withPage(() => Vue.prototype.$page)
        }
    }
};
